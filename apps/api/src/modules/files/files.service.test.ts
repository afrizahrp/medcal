import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { FilesService } from "./files.service";
import type { UploadedFile } from "./files.constants";
import { FileOwnerPolicyRegistry } from "./owner-policy";
import { LocalDiskDriver } from "./storage/local-disk.driver";
import type { StorageDriver } from "./storage/storage-driver";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const COMPANY = "PKM";
const OWNER_TYPE = "OTHER";

let root: string;
let driver: LocalDiskDriver;
let registry: FileOwnerPolicyRegistry;
let service: FilesService;
let ownerLocked = false;
let userId: string;
const createdIds: string[] = [];

function pdfFile(over: Partial<UploadedFile> = {}): UploadedFile {
  return { originalname: "cert.pdf", mimetype: "application/pdf", size: PDF.length, buffer: PDF, ...over };
}

function upload(over: Record<string, unknown> = {}) {
  return service.upload({
    companyId: COMPANY,
    userId,
    role: "SUPERADMIN" as MembershipRole,
    ownerType: OWNER_TYPE,
    ownerId: "owner-1",
    file: pdfFile(),
    ...over,
  });
}

beforeAll(async () => {
  const user =
    (await prisma.user.findFirst({ select: { id: true } })) ??
    (await prisma.user.create({
      data: { email: `files-test-${Date.now()}@example.com`, status: "ACTIVE" },
      select: { id: true },
    }));
  userId = user.id;

  root = mkdtempSync(path.join(tmpdir(), "medcal-filesvc-"));
  driver = new LocalDiskDriver(root);
  registry = new FileOwnerPolicyRegistry();
  registry.register({
    ownerType: OWNER_TYPE,
    permissionResource: "equipment",
    fileTypePolicy: { mimeTypes: ["application/pdf"], extensions: [".pdf"], maxBytes: 5 * 1024 * 1024 },
    async resolveOwner(_companyId, ownerId) {
      return { exists: ownerId !== "missing", locked: ownerLocked };
    },
  });
  service = new FilesService(driver, registry);
});

beforeEach(() => {
  ownerLocked = false;
});

afterAll(async () => {
  if (createdIds.length) {
    await prisma.fileObject.deleteMany({ where: { id: { in: createdIds } } });
  }
  rmSync(root, { recursive: true, force: true });
});

describe("FilesService.upload", () => {
  it("stores the binary, computes sha256, and records metadata", async () => {
    const fo = await upload();
    createdIds.push(fo.id);

    expect(fo.companyId).toBe(COMPANY);
    expect(fo.checksum).toBe(createHash("sha256").update(PDF).digest("hex"));
    expect(fo.sizeBytes).toBe(PDF.length);
    expect(fo.mimeType).toBe("application/pdf");
    expect(fo.uploadedByUserId).toBe(userId);
    expect(fo.storageKey.startsWith(`${COMPANY}/${OWNER_TYPE}/owner-1/`)).toBe(true);
    expect(await driver.exists(fo.storageKey)).toBe(true);
  });

  it("rejects a disallowed MIME type", async () => {
    await expect(upload({ file: pdfFile({ mimetype: "image/png" }) })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects bytes that are not really a PDF", async () => {
    await expect(
      upload({ file: pdfFile({ buffer: Buffer.from("not a pdf") }) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an oversized file", async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]);
    await expect(upload({ file: pdfFile({ buffer: big, size: big.length }) })).rejects.toBeTruthy();
  });

  it("rejects an unknown owner", async () => {
    await expect(upload({ ownerId: "missing" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a caller without the owner's write permission", async () => {
    await expect(upload({ role: "CUSTOMER" as MembershipRole })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects upload to a confirmed (locked) owner", async () => {
    ownerLocked = true;
    await expect(upload()).rejects.toBeInstanceOf(ConflictException);
  });

  it("leaves no metadata row when the storage write fails", async () => {
    const brokenDriver: StorageDriver = {
      allocateTemp: () => driver.allocateTemp(),
      put: async () => {
        throw new Error("disk full");
      },
      get: (k) => driver.get(k),
      delete: (k) => driver.delete(k),
      exists: (k) => driver.exists(k),
    };
    const brokenService = new FilesService(brokenDriver, registry);
    await expect(
      brokenService.upload({
        companyId: COMPANY,
        userId,
        role: "SUPERADMIN" as MembershipRole,
        ownerType: OWNER_TYPE,
        ownerId: "owner-broken",
        file: pdfFile(),
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    const rows = await prisma.fileObject.findMany({ where: { companyId: COMPANY, ownerId: "owner-broken" } });
    expect(rows).toHaveLength(0);
  });
});

describe("FilesService retrieval / isolation / lifecycle", () => {
  it("downloads a file for a same-company caller with the right MIME", async () => {
    const fo = await upload({ ownerId: "owner-dl" });
    createdIds.push(fo.id);
    const { stream, fileObject } = await service.getForDownload(COMPANY, fo.id, "SUPERADMIN" as MembershipRole);
    expect(fileObject.mimeType).toBe("application/pdf");
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).equals(PDF)).toBe(true);
  });

  it("never returns another company's file, even with the id", async () => {
    const fo = await upload({ ownerId: "owner-x" });
    createdIds.push(fo.id);
    await expect(
      service.getForDownload("OTHER_CO", fo.id, "SUPERADMIN" as MembershipRole),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("500s rather than serving a row whose binary is gone", async () => {
    const fo = await upload({ ownerId: "owner-missing-bytes" });
    createdIds.push(fo.id);
    await rm(path.join(root, fo.storageKey), { force: true });
    await expect(
      service.getForDownload(COMPANY, fo.id, "SUPERADMIN" as MembershipRole),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("verifies integrity and detects tampering", async () => {
    const fo = await upload({ ownerId: "owner-verify" });
    createdIds.push(fo.id);
    expect((await service.verifyIntegrity(COMPANY, fo.id)).ok).toBe(true);
    await prisma.fileObject.update({ where: { id: fo.id }, data: { checksum: "deadbeef" } });
    expect((await service.verifyIntegrity(COMPANY, fo.id)).ok).toBe(false);
  });

  it("deletes a DRAFT-owner file (row + binary)", async () => {
    const fo = await upload({ ownerId: "owner-del" });
    const key = fo.storageKey;
    await service.delete(COMPANY, fo.id, "SUPERADMIN" as MembershipRole);
    expect(await driver.exists(key)).toBe(false);
    expect(await prisma.fileObject.findUnique({ where: { id: fo.id } })).toBeNull();
  });

  it("refuses to delete a file on a confirmed (locked) owner", async () => {
    const fo = await upload({ ownerId: "owner-locked-del" });
    createdIds.push(fo.id);
    ownerLocked = true;
    await expect(
      service.delete(COMPANY, fo.id, "SUPERADMIN" as MembershipRole),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
