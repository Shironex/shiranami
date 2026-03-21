export const LISTENING_HISTORY_UPDATED_EVENT = 'shiranami:listening-history-updated';

export function emitListeningHistoryUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(LISTENING_HISTORY_UPDATED_EVENT));
}

export function subscribeToListeningHistoryUpdates(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(LISTENING_HISTORY_UPDATED_EVENT, callback);
  return () => {
    window.removeEventListener(LISTENING_HISTORY_UPDATED_EVENT, callback);
  };
}
