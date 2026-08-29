import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import {
  StorageKeyConflictError,
  StorageObjectNotFoundError,
  StoragePathTraversalError,
  type StorageDriver,
} from "./storage-driver";

/**
 * Local disk on a (in production, bind-mounted) host directory. Approved
 * Phase-1 backend — see the file-infrastructure audit §21 Option A.
 *
 * Binaries are never overwritten in place: `put` opens the destination with
 * the `wx` flag and fails with StorageKeyConflictError if it already exists.
 */
export class LocalDiskDriver implements StorageDriver {
  private readonly root: string;
  private readonly tmpDir: string;

  constructor(root: string) {
    if (!root || !root.trim()) {
      throw new Error("LocalDiskDriver requires a non-empty root directory");
    }
    this.root = path.resolve(root);
    this.tmpDir = path.join(this.root, ".tmp");
  }

  /** Map an opaque storage key to an absolute path inside the root, or throw. */
  private resolveKey(key: string): string {
    if (!key || key.includes("\0") || path.isAbsolute(key)) {
      throw new StoragePathTraversalError(key);
    }
    const normalized = path.posix.normalize(key.replace(/\\/g, "/"));
    if (
      normalized.startsWith("../") ||
      normalized === ".." ||
      normalized.startsWith("/") ||
      normalized.split("/").includes("..")
    ) {
      throw new StoragePathTraversalError(key);
    }
    const abs = path.resolve(this.root, normalized);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (abs !== this.root && !abs.startsWith(rootWithSep)) {
      throw new StoragePathTraversalError(key);
    }
    return abs;
  }

  async allocateTemp(): Promise<{ path: string; dispose: () => Promise<void> }> {
    await fs.mkdir(this.tmpDir, { recursive: true });
    const tempPath = path.join(this.tmpDir, `${Date.now()}-${randomUUID()}.part`);
    return {
      path: tempPath,
      dispose: async () => {
        await fs.rm(tempPath, { force: true });
      },
    };
  }

  async put(key: string, sourcePath: string): Promise<void> {
    const abs = this.resolveKey(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });

    let handle: fs.FileHandle;
    try {
      // "wx": create for writing; fail with EEXIST if the path already exists.
      handle = await fs.open(abs, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        throw new StorageKeyConflictError(key);
      }
      throw err;
    }

    try {
      await pipeline(createReadStream(sourcePath), handle.createWriteStream());
    } catch (err) {
      await handle.close().catch(() => undefined);
      await fs.rm(abs, { force: true }).catch(() => undefined);
      throw err;
    }
    await handle.close().catch(() => undefined);
    await fs.rm(sourcePath, { force: true }).catch(() => undefined);
  }

  async get(key: string): Promise<Readable> {
    const abs = this.resolveKey(key);
    try {
      await fs.access(abs);
    } catch {
      throw new StorageObjectNotFoundError(key);
    }
    return createReadStream(abs);
  }

  async delete(key: string): Promise<void> {
    const abs = this.resolveKey(key);
    await fs.rm(abs, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    const abs = this.resolveKey(key);
    try {
      await fs.access(abs);
      return true;
    } catch {
      return false;
    }
  }
}
