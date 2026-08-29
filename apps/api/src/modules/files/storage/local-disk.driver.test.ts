import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalDiskDriver } from "./local-disk.driver";
import { StorageKeyConflictError, StoragePathTraversalError } from "./storage-driver";

let root: string;
let driver: LocalDiskDriver;

async function tempWith(content: string): Promise<string> {
  const t = await driver.allocateTemp();
  await writeFile(t.path, content);
  return t.path;
}

async function streamToString(driverKey: string): Promise<string> {
  const stream = await driver.get(driverKey);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "medcal-storage-"));
  driver = new LocalDiskDriver(root);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("LocalDiskDriver", () => {
  it("writes, reads, checks existence and deletes a file", async () => {
    const key = "PKM/EQUIPMENT_CALIBRATION/rec1/aaaa.pdf";
    await driver.put(key, await tempWith("hello"));
    expect(await driver.exists(key)).toBe(true);
    expect(await streamToString(key)).toBe("hello");
    await driver.delete(key);
    expect(await driver.exists(key)).toBe(false);
  });

  it("consumes the temp file on put", async () => {
    const key = "PKM/OTHER/rec2/bbbb.pdf";
    const temp = await tempWith("x");
    await driver.put(key, temp);
    await expect(readFile(temp)).rejects.toBeInstanceOf(Error);
  });

  it("never overwrites an existing key", async () => {
    const key = "PKM/OTHER/rec3/cccc.pdf";
    await driver.put(key, await tempWith("first"));
    await expect(driver.put(key, await tempWith("second"))).rejects.toBeInstanceOf(
      StorageKeyConflictError,
    );
    expect(await streamToString(key)).toBe("first");
  });

  it("rejects path traversal and absolute paths", async () => {
    await expect(driver.get("../etc/passwd")).rejects.toBeInstanceOf(StoragePathTraversalError);
    await expect(driver.exists("a/../../b")).rejects.toBeInstanceOf(StoragePathTraversalError);
    await expect(
      driver.put(path.resolve(root, "abs"), await tempWith("z")),
    ).rejects.toBeInstanceOf(StoragePathTraversalError);
  });

  it("delete is idempotent for a missing key", async () => {
    await expect(driver.delete("PKM/OTHER/none/zzzz.pdf")).resolves.toBeUndefined();
  });

  it("allocates temp paths under the root", async () => {
    const t = await driver.allocateTemp();
    expect(path.resolve(t.path).startsWith(path.resolve(root))).toBe(true);
    await t.dispose();
  });
});
