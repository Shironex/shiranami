import { useEffect } from 'react';
import { toast } from 'sonner';
import type { SystemNotice } from '@shiranami/contracts';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';

/**
 * Map a notice `code` to a `toast` namespace key. Keeping the mapping here (not
 * on the wire) means the main process emits stable codes while wording lives in
 * the locale files. An unmapped code falls back to a generic key so a new
 * emitter is never silent.
 */
const CODE_TO_TOAST_KEY: Record<string, string> = {
  discordLoginFailed: 'discordLoginFailed',
  albumArtPruneFailed: 'albumArtPruneFailed',
};

const FALLBACK_KEY = 'systemNoticeGeneric';

/**
 * Surface structured `system:notice` events from the main process as calm
 * toasts. The main process already dedupes/throttles per `source:code`, so this
 * hook stays thin: translate, pick a toast variant from `level`, and use a
 * per-code toast id so a repeated notice replaces rather than stacks.
 *
 * Must be mounted once at the app root. No-op outside Electron.
 */
export function useSystemNotices() {
  useEffect(() => {
    if (!IS_ELECTRON) return;

    return window.electronAPI.system.onNotice((notice: SystemNotice) => {
      const key = CODE_TO_TOAST_KEY[notice.code] ?? FALLBACK_KEY;
      const message = i18n.t(key, { ns: 'toast', ...notice.meta });
      const toastId = `system-notice-${notice.source}-${notice.code}`;

      if (notice.level === 'error') {
        toast.error(message, { id: toastId });
      } else if (notice.level === 'info') {
        toast.info(message, { id: toastId });
      } else {
        toast.warning(message, { id: toastId });
      }
    });
  }, []);
}
