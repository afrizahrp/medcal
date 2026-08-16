import type { ChatMessage } from "@medcal/db";

/**
 * ChatMessage.seq is declared Int in schema.prisma but the Phase 1 migration
 * created it as BIGSERIAL, so Prisma returns it as a JS BigInt at runtime —
 * neither socket.io's nor Nest's default JSON encoder can serialize a
 * BigInt. Converted to a plain number only at wire boundaries (WS payloads
 * and REST responses); the DB/Prisma layer is untouched. Shared by
 * ChatGateway and the admin REST controller so this conversion happens in
 * exactly one place.
 */
export function serializeChatMessage(message: ChatMessage): Omit<ChatMessage, "seq"> & { seq: number } {
  return { ...message, seq: Number(message.seq) };
}
