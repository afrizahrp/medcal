type ContactMessagesChangeListener = () => void;

const contactMessagesChangeListeners = new Set<ContactMessagesChangeListener>();

/** Call after linked ContactMessage workflow state may have changed (e.g. chat close). */
export function notifyContactMessagesChanged(): void {
  for (const listener of contactMessagesChangeListeners) listener();
}

export function subscribeContactMessagesChanged(listener: ContactMessagesChangeListener): () => void {
  contactMessagesChangeListeners.add(listener);
  return () => {
    contactMessagesChangeListeners.delete(listener);
  };
}
