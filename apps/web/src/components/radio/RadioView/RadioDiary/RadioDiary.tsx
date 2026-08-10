import { Check, Download, Loader2, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRadioDiary } from './RadioDiary.hooks';
import type { IRadioDiaryProps } from './RadioDiary.types';

export default function RadioDiary(props: IRadioDiaryProps) {
  const { t, entries, isLoading, stationLabel, hasStation, isEmpty, onClose } =
    useRadioDiary(props);

  const skeletonElements = isLoading
    ? Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-11 rounded-lg bg-muted/25 animate-pulse" />
      ))
    : null;

  const entryElements = entries.map(entry => {
    let actionGlyph = <Download className="w-3.5 h-3.5" />;
    if (entry.status === 'searching') {
      actionGlyph = <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    } else if (entry.status === 'queued') {
      actionGlyph = <Check className="w-3.5 h-3.5" />;
    } else if (entry.status === 'error') {
      actionGlyph = <RotateCcw className="w-3.5 h-3.5" />;
    }

    return (
      <li
        key={entry.id}
        className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40 transition-colors"
      >
        <time
          className="shrink-0 mt-0.5 text-[11px] tabular-nums text-muted-foreground/60"
          title={entry.timestampLabel}
        >
          {entry.timeLabel}
        </time>
        {/* The raw StreamTitle, never the derived split — see RadioDiary.types. */}
        <p className="min-w-0 flex-1 text-xs leading-5 text-foreground/85 break-words">
          {entry.raw}
        </p>
        <button
          onClick={entry.onGetTrack}
          aria-label={entry.actionLabel}
          title={entry.actionLabel}
          disabled={entry.status === 'queued'}
          className={cn(
            'shrink-0 mt-0.5 rounded-md p-1 transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:opacity-100',
            entry.status === 'queued'
              ? 'text-primary/70'
              : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground'
          )}
        >
          {actionGlyph}
        </button>
      </li>
    );
  });

  let body;
  if (!hasStation) {
    body = <p className="px-2 py-6 text-xs leading-5 text-muted-foreground/60">{t('diaryIdle')}</p>;
  } else if (isLoading) {
    body = <div className="flex flex-col gap-1.5 px-2">{skeletonElements}</div>;
  } else if (isEmpty) {
    body = (
      <p className="px-2 py-6 text-xs leading-5 text-muted-foreground/60">{t('diaryEmpty')}</p>
    );
  } else {
    body = <ul className="flex flex-col gap-0.5">{entryElements}</ul>;
  }

  return (
    <aside
      aria-label={t('diaryTitle')}
      className="hidden lg:flex w-72 shrink-0 flex-col mr-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden"
    >
      <div className="shrink-0 flex items-start gap-2 px-4 pt-3.5 pb-2.5 border-b border-border/25">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground/85">{t('diaryTitle')}</p>
          <p className="text-[11px] text-muted-foreground/60 truncate">
            {stationLabel || t('diarySubtitleIdle')}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={t('diaryClose')}
          className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 py-2">{body}</div>
    </aside>
  );
}
