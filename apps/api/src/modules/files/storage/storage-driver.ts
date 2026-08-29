import type { Readable } from "node:stream";

/** DI token for the active StorageDriver implementation. */
export const STORAGE_DRIVER = Symbol("STORAGE_DRIVER");

/** A caller tried to use a key that resolves outside the storage root. */
export class StoragePathTraversalError extends Error {
  constructor(key: string) {
    super(`Storage key resolves outside the storage root: ${key}`);
    this.name = "StoragePathTraversalError";
  }
}

/** `put` was called for a key whose binary already exists — never overwrite. */
export class StorageKeyConflictError extends Error {
  constructor(key: string) {
    super(`Storage key already exists: ${key}`);
    this.name = "StorageKeyConflictError";
  }
}

/** `get` was called for a key that has no binary. */
export class StorageObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage object not found: ${key}`);
    this.name = "StorageObjectNotFoundError";
  }
}

/**
 * The only storage contract the business modules ever see. A future
 * MinIO/S3 implementation swaps in here without any change upstream — the
 * `storageKey` stored on FileObject stays identical across a migration.
 */
export interface StorageDriver {
  /** Allocate a temp path on the same filesystem as the final store. */
  allocateTemp(): Promise<{ path: string; dispose: () => Promise<void> }>;
  /** Move an already-validated temp file to `key`. Fails if `key` exists. */
  put(key: string, sourcePath: string): Promise<void>;
  /** Open the binary at `key` for reading. */
  get(key: string): Promise<Readable>;
  /** Remove the binary at `key`. Idempotent (missing key is not an error). */
  delete(key: string): Promise<void>;
  /** Whether a binary exists at `key`. */
  exists(key: string): Promise<boolean>;
}
