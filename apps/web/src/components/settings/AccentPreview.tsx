import { useTranslation } from 'react-i18next';
import { Heart, Music2, Play } from 'lucide-react';
import { SettingsPreview } from '@/components/settings/SettingsPreview';

/**
 * Sample chrome rendered entirely from the accent tokens (`bg-primary`,
 * `text-primary-foreground`, `--primary-rgb`), so it live-updates as the user
 * picks a swatch — including the computed foreground, which is the part a
 * bare color chip can't show.
 */
export function AccentPreview() {
  const { t } = useTranslation('settings');

  return (
    <SettingsPreview title={t('app.accent.previewTitle')}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={t('app.accent.previewTitle')}
      >
        <div className="mx-auto max-w-[340px] rounded-xl border border-border/25 bg-surface/60 p-3">
          {/* Fake track row: icon tile + title bars + favorite */}
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Music2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-2.5 w-28 rounded-full bg-foreground/25" />
              <div className="h-2 w-20 rounded-full bg-muted-foreground/25" />
            </div>
            <Heart className="size-4 shrink-0 fill-primary/80 text-primary" />
          </div>

          {/* Progress bar with accent glow */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/35">
            <div
              className="h-full w-[62%] rounded-full bg-primary/70"
              style={{ boxShadow: '0 0 10px rgba(var(--primary-rgb), 0.5)' }}
            />
          </div>

          {/* Control row: play button (shows the computed foreground), active
              nav pill, and an "on" switch — the accent in its real habitats */}
          <div className="mt-3 flex items-center justify-between">
            <div className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow">
              <Play className="size-3.5 fill-current" />
            </div>
            <div className="rounded-md bg-primary/15 px-2.5 py-1 ring-1 ring-primary/35">
              <div className="h-1.5 w-10 rounded-full bg-primary/80" />
            </div>
            <div className="flex h-4.5 w-8 items-center rounded-full bg-primary p-0.5">
              <div className="ml-auto size-3.5 rounded-full bg-primary-foreground/95 shadow" />
            </div>
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}
