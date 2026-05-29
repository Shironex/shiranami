/**
 * Centralized names for the `window` CustomEvents used as an ad-hoc dialog
 * bus. Dispatchers (context menus, view headers, keyboard shortcuts) and the
 * listener-side managers reference these constants so the string can't drift
 * between the two sides.
 */
export const DIALOG_EVENTS = {
  /** Open the share dialog. Detail: `{ type: 'track' | 'playlist'; id: string }`. */
  openShare: 'open-share-dialog',
  /** Open the per-track metadata enrich dialog. Detail: `{ trackId: string }`. */
  openTrackEnrich: 'open-track-enrich-dialog',
  /** Open the keyboard-shortcuts help overlay. No detail. */
  openShortcutHelp: 'open-shortcut-help',
  /** Open the manual tag editor dialog. Detail: `{ trackId: string }`. */
  openEditTags: 'open-edit-tags-dialog',
} as const;

export type DialogEventName = (typeof DIALOG_EVENTS)[keyof typeof DIALOG_EVENTS];
