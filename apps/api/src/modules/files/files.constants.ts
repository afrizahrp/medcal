/**
 * Hard ceiling for a single upload, enforced both by the multipart parser
 * (per-route) and defensively in the service. Nginx must allow at least this
 * (`client_max_body_size`, see infra/nginx/api.kalibrasimedika.co.id.conf.example).
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MiB

/**
 * The subset of a multer file object the FilesModule uses. Declared locally so
 * apps/api does not need to depend on `@types/multer` just for this.
 */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
