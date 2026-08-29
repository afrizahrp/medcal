import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { hasPermission } from "@medcal/auth";
import { prisma } from "@medcal/db";
import type { FileObject, MembershipRole } from "@medcal/db";
import { validateUpload } from "./file-validation";
import { MAX_UPLOAD_BYTES, type UploadedFile } from "./files.constants";
import { FileOwnerPolicyRegistry } from "./owner-policy";
import { buildStorageKey } from "./storage/storage-key";
import {
  STORAGE_DRIVER,
  StorageKeyConflictError,
  type StorageDriver,
} from "./storage/storage-driver";

const EXTENSION_BY_MIME: Record<string, string> = { "application/pdf": ".pdf" };

export interface UploadContext {
  companyId: string;
  userId: string;
  role: MembershipRole;
  ownerType: string;
  ownerId: string;
  file: UploadedFile | undefined;
}

const FORBIDDEN = new ForbiddenException({ code: "FORBIDDEN", message: "Forbidden" });

@Injectable()
export class FilesService {
  constructor(
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    private readonly registry: FileOwnerPolicyRegistry,
  ) {}

  async upload(ctx: UploadContext): Promise<FileObject> {
    const policy = this.registry.get(ctx.ownerType);
    validateUpload(ctx.file, policy.fileTypePolicy);
    const file = ctx.file as UploadedFile;

    if (file.buffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException({
        code: "FILE_TOO_LARGE",
        message: "File exceeds the maximum upload size",
      });
    }

    const owner = await policy.resolveOwner(ctx.companyId, ctx.ownerId);
    if (!owner.exists) {
      throw new NotFoundException({
        code: "FILE_OWNER_NOT_FOUND",
        message: "The owner record does not exist",
      });
    }
    if (!hasPermission(ctx.role, policy.permissionResource as never, policy.writeAction ?? "update")) {
      throw FORBIDDEN;
    }
    if (owner.locked) {
      throw new ConflictException({
        code: "FILE_OWNER_LOCKED",
        message: "The owner record is confirmed; its evidence is immutable",
      });
    }

    const fileId = randomUUID();
    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    const extension =
      EXTENSION_BY_MIME[file.mimetype] ??
      path.extname(file.originalname || "").toLowerCase() ??
      null;
    const storageKey = buildStorageKey({
      companyId: ctx.companyId,
      ownerType: ctx.ownerType,
      ownerId: ctx.ownerId,
      fileId,
      extension: extension || null,
    });

    // temp-write -> commit (fails if the final key exists) -> DB insert.
    // Bytes land before the row, so a successful response never yields a
    // FileObject row without its binary. A DB failure after the commit is
    // compensated by deleting the just-written binary.
    const temp = await this.storage.allocateTemp();
    try {
      await writeFile(temp.path, file.buffer);
      await this.storage.put(storageKey, temp.path);
    } catch (err) {
      await temp.dispose();
      if (err instanceof StorageKeyConflictError) {
        throw new ConflictException({
          code: "FILE_STORAGE_KEY_CONFLICT",
          message: "A file with this storage key already exists",
        });
      }
      throw new InternalServerErrorException({
        code: "FILE_STORAGE_WRITE_FAILED",
        message: "Failed to persist the uploaded file",
      });
    }

    try {
      return await prisma.fileObject.create({
        data: {
          id: fileId,
          companyId: ctx.companyId,
          ownerType: ctx.ownerType as FileObject["ownerType"],
          ownerId: ctx.ownerId,
          storageKey,
          checksum,
          sizeBytes: file.buffer.length,
          mimeType: file.mimetype,
          originalName: file.originalname ? file.originalname.slice(0, 255) : null,
          uploadedByUserId: ctx.userId,
        },
      });
    } catch {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw new InternalServerErrorException({
        code: "FILE_METADATA_WRITE_FAILED",
        message: "Failed to record file metadata",
      });
    }
  }

  private async resolve(companyId: string, id: string): Promise<FileObject> {
    // Company scope is enforced in the query itself — a cross-company id is a
    // plain 404, never a leak, and the id is never assumed to be secret.
    const fileObject = await prisma.fileObject.findFirst({ where: { id, companyId } });
    if (!fileObject) {
      throw new NotFoundException({ code: "FILE_NOT_FOUND", message: "File not found" });
    }
    return fileObject;
  }

  async getForDownload(companyId: string, id: string, role: MembershipRole) {
    const fileObject = await this.resolve(companyId, id);
    const policy = this.registry.get(fileObject.ownerType);
    const owner = await policy.resolveOwner(companyId, fileObject.ownerId);
    if (!owner.exists) {
      throw new NotFoundException({ code: "FILE_NOT_FOUND", message: "File not found" });
    }
    if (!hasPermission(role, policy.permissionResource as never, policy.readAction ?? "read")) {
      throw FORBIDDEN;
    }
    if (!(await this.storage.exists(fileObject.storageKey))) {
      throw new InternalServerErrorException({
        code: "FILE_BYTES_MISSING",
        message: "The stored file is missing",
      });
    }
    return { stream: await this.storage.get(fileObject.storageKey), fileObject };
  }

  async delete(companyId: string, id: string, role: MembershipRole) {
    const fileObject = await this.resolve(companyId, id);
    const policy = this.registry.get(fileObject.ownerType);
    const owner = await policy.resolveOwner(companyId, fileObject.ownerId);

    if (owner.exists) {
      if (!hasPermission(role, policy.permissionResource as never, policy.writeAction ?? "update")) {
        throw FORBIDDEN;
      }
      if (owner.locked) {
        throw new ConflictException({
          code: "FILE_OWNER_LOCKED",
          message: "Confirmed evidence cannot be deleted",
        });
      }
    }

    await this.storage.delete(fileObject.storageKey).catch(() => undefined);
    await prisma.fileObject.delete({ where: { id: fileObject.id } });
    return { id: fileObject.id, deleted: true };
  }

  /**
   * Internal integrity check: re-hash the stored binary and compare it to the
   * recorded checksum. No public route — for a health check / restore verify.
   */
  async verifyIntegrity(companyId: string, id: string) {
    const fileObject = await this.resolve(companyId, id);
    if (!(await this.storage.exists(fileObject.storageKey))) {
      return { id: fileObject.id, ok: false as const, reason: "BYTES_MISSING" as const };
    }
    const stream = await this.storage.get(fileObject.storageKey);
    const hash = createHash("sha256");
    for await (const chunk of stream) hash.update(chunk as Buffer);
    const actual = hash.digest("hex");
    return {
      id: fileObject.id,
      ok: actual === fileObject.checksum,
      expected: fileObject.checksum,
      actual,
    };
  }
}
