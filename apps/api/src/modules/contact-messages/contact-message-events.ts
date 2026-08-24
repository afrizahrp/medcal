import { EventEmitter } from "node:events";

/**
 * Internal, backend-only signal — mirrors the frontend's own
 * contact-messages-sync.ts module-level pub/sub shape (publish/subscribe,
 * no payload other than what a listener needs), but exists purely to get a
 * "ContactMessage was just created" fact from ContactMessagesService.create
 * (Contact Form + WhatsApp-lead's shared path) and ChatSessionsService.
 * createSession (Web Chat's first message) to ChatGateway, which is the only
 * thing holding the live Socket.IO server reference.
 *
 * A direct DI import of ChatGateway into ContactMessagesService isn't
 * possible without a circular module dependency: ChatModule already imports
 * ContactMessagesModule (for the reused create() call), so
 * ContactMessagesModule importing ChatModule back would cycle. This
 * Node-stdlib EventEmitter singleton is the smallest decoupling that avoids
 * that without forwardRef() boilerplate on either module — not a new
 * frontend-facing event bus, just internal backend wiring (E2E leads
 * statistics sync audit, follow-up 2026-08-25).
 */
const emitter = new EventEmitter();
const EVENT = "contact-message-created";

export interface ContactMessageCreatedPayload {
  companyId: string;
}

/** Call only after the ContactMessage row's transaction has committed. */
export function publishContactMessageCreated(payload: ContactMessageCreatedPayload): void {
  emitter.emit(EVENT, payload);
}

export function onContactMessageCreated(
  listener: (payload: ContactMessageCreatedPayload) => void,
): () => void {
  emitter.on(EVENT, listener);
  return () => emitter.off(EVENT, listener);
}
