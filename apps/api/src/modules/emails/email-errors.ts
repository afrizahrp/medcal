import { HttpException, HttpStatus } from "@nestjs/common";

export function emailHttpError(status: number, code: string, message: string): HttpException {
  return new HttpException({ message, code }, status);
}

export function smtpDeliveryFailed(message = "SMTP delivery failed"): HttpException {
  return emailHttpError(HttpStatus.BAD_GATEWAY, "SMTP_DELIVERY_FAILED", message);
}

export function imapSyncFailed(message = "IMAP sync failed"): HttpException {
  return emailHttpError(HttpStatus.BAD_GATEWAY, "IMAP_SYNC_FAILED", message);
}

export function emailNotConfigured(message = "Email is not configured"): HttpException {
  return emailHttpError(HttpStatus.SERVICE_UNAVAILABLE, "EMAIL_NOT_CONFIGURED", message);
}
