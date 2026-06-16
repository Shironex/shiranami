import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ErrorInfo } from 'react';

interface IUseErrorBoundaryArgs {
  readonly error: Error;
  readonly errorInfo: ErrorInfo | null;
  readonly viewName?: string;
  readonly root?: boolean;
}

interface IUseErrorBoundaryResult {
  /** Compact-strip / card-shared "something went wrong" heading. */
  readonly compactTitle: string;
  /** Localized heading for the active variant (root vs. view). */
  readonly title: string;
  /** Localized body copy — the error message for view crashes, a generic line at root. */
  readonly message: string;
  /** Localized label for the primary reload/reset action. */
  readonly primaryLabel: string;
  /** Localized "report" affordance label. */
  readonly reportLabel: string;
  /** Copy a diagnostic payload to the clipboard, toasting success/failure. */
  readonly onReport: () => Promise<void>;
}

/**
 * i18n + report wiring for the {@link ErrorBoundary} fallback. The boundary
 * itself is a class component (no hooks), so the rendered fallback — a function
 * component — owns the translator and clipboard report through this hook,
 * keeping that logic out of the fallback's render body.
 */
export function useErrorBoundary({
  error,
  errorInfo,
  viewName,
  root,
}: IUseErrorBoundaryArgs): IUseErrorBoundaryResult {
  const { t } = useTranslation('errorBoundary');

  const onReport = async (): Promise<void> => {
    const payload = [
      `View: ${viewName ?? 'unknown'}`,
      `Message: ${error.message}`,
      `Stack: ${error.stack ?? '(no stack)'}`,
      `Component stack: ${errorInfo?.componentStack ?? '(none)'}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(payload);
      toast.success(t('reportCopied'));
    } catch {
      toast.error(t('reportFailed'));
    }
  };

  return {
    compactTitle: t('title'),
    title: root ? t('rootTitle') : t('title'),
    message: root ? t('rootMessage') : error.message || t('messageFallback'),
    primaryLabel: root ? t('reloadApp') : t('reloadView'),
    reportLabel: t('report'),
    onReport,
  };
}
