import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertCircle, RefreshCw, ClipboardCopy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

interface ErrorBoundaryProps {
  children: ReactNode;
  viewName?: string;
  root?: boolean;
  /**
   * Render a minimal inline fallback instead of the full-page error card.
   * Use for small chrome surfaces (top bar, player bar, sidebar) where the
   * large card would blow out the layout if that surface crashes.
   */
  compact?: boolean;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface ErrorBoundaryFallbackProps {
  error: Error;
  errorInfo: ErrorInfo | null;
  viewName?: string;
  root?: boolean;
  compact?: boolean;
  onReset: () => void;
}

function ErrorBoundaryFallback({
  error,
  errorInfo,
  viewName,
  root,
  compact,
  onReset,
}: ErrorBoundaryFallbackProps) {
  const { t } = useTranslation('errorBoundary');

  const handleReport = async () => {
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

  const handlePrimary = () => {
    if (root) {
      window.location.reload();
    } else {
      onReset();
    }
  };

  const title = root ? t('rootTitle') : t('title');
  const message = root ? t('rootMessage') : error.message || t('messageFallback');
  const primaryLabel = root ? t('reloadApp') : t('reloadView');

  // Compact inline variant for chrome surfaces (top bar, player bar, sidebar):
  // a single self-sized strip that won't blow out the surrounding layout.
  if (compact) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground"
      >
        <AlertCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
        <span className="truncate">{t('title')}</span>
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className="size-3" />
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={handleReport}
          className="shrink-0 rounded-md p-0.5 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('report')}
          title={t('report')}
        >
          <ClipboardCopy className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center p-8',
        root ? 'min-h-screen w-screen bg-background' : 'flex-1 min-h-full'
      )}
    >
      <div
        className={cn(
          'w-full rounded-2xl border border-destructive/20 bg-card p-6 flex flex-col gap-4',
          root ? 'max-w-lg' : 'max-w-md'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-destructive" />
          </div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={handlePrimary}>
            <RefreshCw /> {primaryLabel}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReport}>
            <ClipboardCopy /> {t('report')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ error, errorInfo });
    logger.error(
      '[ErrorBoundary:' + (this.props.viewName ?? 'unknown') + ']',
      error,
      errorInfo.componentStack
    );
    // Remote capture (no-op unless telemetry initialized). The local logger
    // above + the clipboard report below remain the offline-first fallback.
    captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
  }

  reset = (): void => {
    this.setState({ error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error, errorInfo } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorBoundaryFallback
        error={error}
        errorInfo={errorInfo}
        viewName={this.props.viewName}
        root={this.props.root}
        compact={this.props.compact}
        onReset={this.reset}
      />
    );
  }
}
