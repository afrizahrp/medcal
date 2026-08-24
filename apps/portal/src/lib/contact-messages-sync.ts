import { notifyUnreadCountChanged } from "./use-unread-count";

type ContactMessagesChangeListener = () => void;

const contactMessagesChangeListeners = new Set<ContactMessagesChangeListener>();

/** Call after linked ContactMessage workflow state may have changed (e.g. chat mark-read / close). */
export function notifyContactMessagesChanged(): void {
  notifyUnreadCountChanged("contact");
  for (const listener of contactMessagesChangeListeners) listener();
}

export function subscribeContactMessagesChanged(listener: ContactMessagesChangeListener): () => void {
  contactMessagesChangeListeners.add(listener);
  return () => {
    contactMessagesChangeListeners.delete(listener);
  };
}
