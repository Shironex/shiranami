// Wire types for the `system:notice` IPC surface.
//
// A single main→renderer channel used to surface subsystem failures that would
// otherwise be swallowed in the logs (Discord RPC login, album-art prune, ...).
// The renderer (`useSystemNotices`) maps `code` → an i18n string and shows a
// calm, deduped toast. Keep this shape in sync with the emitters in
// apps/desktop/src/main and the handler in apps/web/src/hooks/useSystemNotices.ts.

/** Which subsystem a notice came from. */
export type SystemNoticeSource = 'discord' | 'album-art';

/** Severity of a system notice — drives the toast variant in the renderer. */
export type SystemNoticeLevel = 'error' | 'warn' | 'info';

/**
 * Structured failure/status notice emitted over `system:notice`.
 *
 * `code` is a stable identifier the renderer maps to an i18n string (so wording
 * lives in the locale files, not on the wire). `meta` carries optional
 * interpolation values for that string.
 */
export interface SystemNotice {
  source: SystemNoticeSource;
  level: SystemNoticeLevel;
  code: string;
  meta?: Record<string, string | number>;
}
