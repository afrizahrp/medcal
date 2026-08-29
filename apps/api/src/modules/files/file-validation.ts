import path from "node:path";
import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import type { UploadedFile } from "./files.constants";

/** Per-owner allow-list. Data, not architecture — a new owner type just brings its own. */
export interface FileTypePolicy {
  mimeTypes: string[];
  extensions: string[];
  maxBytes: number;
}

/**
 * Byte-level content sniffers keyed by declared MIME type. Used in addition to
 * (never instead of) the extension + declared-MIME checks.
 */
const CONTENT_SNIFFERS: Record<string, (bytes: Buffer) => boolean> = {
  "application/pdf": (bytes) => bytes.subarray(0, 5).toString("latin1") === "%PDF-",
};

export function validateUpload(file: UploadedFile | undefined, policy: FileTypePolicy): void {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new BadRequestException({ code: "FILE_EMPTY", message: "No file content was uploaded" });
  }

  if (file.buffer.length > policy.maxBytes) {
    throw new PayloadTooLargeException({
      code: "FILE_TOO_LARGE",
      message: `File exceeds the ${policy.maxBytes}-byte limit for this owner type`,
    });
  }

  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!policy.extensions.includes(ext)) {
    throw new BadRequestException({
      code: "FILE_EXTENSION_NOT_ALLOWED",
      message: `Extension "${ext || "(none)"}" is not permitted for this owner type`,
    });
  }

  if (!policy.mimeTypes.includes(file.mimetype)) {
    throw new BadRequestException({
      code: "FILE_MIME_NOT_ALLOWED",
      message: `Declared MIME type "${file.mimetype}" is not permitted for this owner type`,
    });
  }

  const sniff = CONTENT_SNIFFERS[file.mimetype];
  if (sniff && !sniff(file.buffer)) {
    throw new BadRequestException({
      code: "FILE_CONTENT_MISMATCH",
      message: "File content does not match its declared type",
    });
  }
}
