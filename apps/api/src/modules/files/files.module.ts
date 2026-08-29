import path from "node:path";
import { Module } from "@nestjs/common";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { FileOwnerPolicyRegistry } from "./owner-policy";
import { LocalDiskDriver } from "./storage/local-disk.driver";
import { STORAGE_DRIVER } from "./storage/storage-driver";

/** Fail-closed: the file store must have an explicitly configured root. */
function resolveFilesRoot(): string {
  const configured = process.env.FILES_ROOT;
  if (!configured || !configured.trim()) {
    throw new Error("FILES_ROOT is not configured — the file store has no root directory");
  }
  return path.resolve(configured.trim());
}

/**
 * Generic file infrastructure (audit §22). Ships with an EMPTY
 * FileOwnerPolicyRegistry — a consuming module (Phase 2B: equipment
 * calibration) injects the exported registry and calls `register(...)` for
 * its own FileOwnerType. Swapping LocalDiskDriver for a future MinIO/S3
 * driver happens only here.
 */
@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    FileOwnerPolicyRegistry,
    CompanyRoleGuard,
    { provide: STORAGE_DRIVER, useFactory: () => new LocalDiskDriver(resolveFilesRoot()) },
  ],
  exports: [FilesService, FileOwnerPolicyRegistry, STORAGE_DRIVER],
})
export class FilesModule {}
