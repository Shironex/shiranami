import { useTranslation } from 'react-i18next';
import { Minus, Square, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';
import { useWindowControls } from '@/hooks/useWindowControls';

interface WindowControlsProps {
  /** Extra classes for the wrapper (e.g. corner padding per host). */
  className?: string;
}

/**
 * Windows-only minimize / maximize / close cluster for the frameless window.
 * Rendered both in the app shell's TopBar and in the first-run onboarding
 * overlay — the overlay sits above the shell, so without this it would have no
 * window chrome at all. Renders nothing on macOS (native traffic lights) or in
 * the browser. Close maps to `window.close()` (quits), matching the shell.
 */
export function WindowControls({ className }: WindowControlsProps) {
  const { t } = useTranslation('topbar');
  const { isMaximized, minimize, maximize, close } = useWindowControls();

  if (!IS_ELECTRON || IS_MAC) return null;

  return (
    <div className={cn('no-drag flex h-full items-center gap-1', className)}>
      <button
        type="button"
        onClick={minimize}
        className="flex h-8 w-10 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:bg-accent hover:text-foreground"
        aria-label={t('minimize')}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={maximize}
        className="flex h-8 w-10 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:bg-accent hover:text-foreground"
        aria-label={isMaximized ? t('restore') : t('maximize')}
      >
        {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={close}
        className={cn(
          'flex h-8 w-10 items-center justify-center rounded-md',
          'text-muted-foreground/55 transition-colors',
          'hover:bg-red-500/85 hover:text-white'
        )}
        aria-label={t('close')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
