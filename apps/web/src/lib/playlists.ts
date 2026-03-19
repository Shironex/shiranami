export const PLAYLISTS_CHANGED_EVENT = 'shiranami:playlists-changed';

export function notifyPlaylistsChanged(): void {
  window.dispatchEvent(new Event(PLAYLISTS_CHANGED_EVENT));
}

export function subscribeToPlaylistChanges(callback: () => void): () => void {
  window.addEventListener(PLAYLISTS_CHANGED_EVENT, callback);
  return () => window.removeEventListener(PLAYLISTS_CHANGED_EVENT, callback);
}

export function shuffleItems<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}
