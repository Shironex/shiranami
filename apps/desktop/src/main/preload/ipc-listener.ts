import { ipcRenderer, type IpcRendererEvent } from 'electron';

/**
 * Build a typed `ipcRenderer.on` subscription helper for `channel`.
 *
 * Returns a `subscribe(callback)` function. Each call wires up a fresh handler
 * and yields an `unsubscribe` function that removes only that listener — not
 * every listener on the channel — so multiple components can subscribe to the
 * same event without trampling each other.
 */
export function createIpcListener<T>(channel: string): (callback: (data: T) => void) => () => void {
  return (callback: (data: T) => void) => {
    const handler = (_event: IpcRendererEvent, data: T) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}
