import { Image, Maximize2, Sparkles, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { SettingsPreview } from '@/components/settings/SettingsPreview';

interface IEffectPreviewProps {
  enabled: boolean;
}

/** Fixed bar heights (px) for the low-performance equalizer mock. */
const LOW_PERF_BAR_HEIGHTS = [32, 58, 42, 76, 48, 68, 38, 56] as const;

export function NowPlayingViewPreview({ enabled }: IEffectPreviewProps) {
  const { t } = useTranslation('settings');

  return (
    <SettingsPreview title={t('app.effectPreview.nowPlayingView')}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={t('app.effectPreview.nowPlayingView')}
      >
        <div className="relative mx-auto h-[140px] max-w-[340px] overflow-hidden rounded-xl border border-border/25 bg-surface/60 p-3">
          <div
            className={cn(
              'absolute inset-0 transition-opacity',
              enabled ? 'opacity-100' : 'opacity-25'
            )}
            style={{
              background:
                'radial-gradient(circle at 22% 18%, rgba(var(--primary-rgb), 0.35), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.05), transparent)',
            }}
          />
          <div className="relative flex h-full items-center gap-3">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-border/25 bg-primary/15 text-primary">
              <Image className="size-8" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-28 rounded-full bg-foreground/25" />
              <div className="h-2 w-20 rounded-full bg-muted-foreground/25" />
              <div className="mt-4 flex items-center gap-2">
                <div className="size-7 rounded-full bg-primary/35" />
                <div className="h-1.5 flex-1 rounded-full bg-muted/35" />
              </div>
            </div>
            <div
              className={cn(
                'absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg border border-border/25',
                enabled ? 'bg-primary/20 text-primary' : 'bg-muted/20 text-muted-foreground/50'
              )}
            >
              <Maximize2 className="size-3.5" />
            </div>
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}

export function LibraryBannerPreview({ enabled }: IEffectPreviewProps) {
  const { t } = useTranslation('settings');

  return (
    <SettingsPreview title={t('app.effectPreview.libraryBanner')}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={t('app.effectPreview.libraryBanner')}
      >
        <div className="mx-auto max-w-[340px] rounded-xl border border-border/25 bg-surface/60 p-3">
          <div
            className={cn(
              'mb-3 flex items-center gap-3 overflow-hidden rounded-lg border border-border/25 bg-primary/10 p-2 transition-all',
              enabled ? 'h-16 opacity-100' : 'h-0 border-transparent p-0 opacity-0'
            )}
          >
            <div className="size-10 shrink-0 rounded-md bg-primary/25" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-2.5 w-24 rounded-full bg-foreground/25" />
              <div className="h-1.5 w-16 rounded-full bg-muted-foreground/25" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-16 rounded-lg bg-muted/30" />
            <div className="h-16 rounded-lg bg-muted/25" />
            <div className="h-16 rounded-lg bg-muted/20" />
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}

export function LowPerformancePreview({ enabled }: IEffectPreviewProps) {
  const { t } = useTranslation('settings');

  const bars = LOW_PERF_BAR_HEIGHTS.map((height, index) => (
    <div key={`${height}-${index}`} className="rounded-t bg-primary/45" style={{ height }} />
  ));

  return (
    <SettingsPreview title={t('app.effectPreview.performance')}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={t('app.effectPreview.performance')}
      >
        <div className="mx-auto max-w-[340px] rounded-xl border border-border/25 bg-surface/60 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <Zap className={cn('size-3.5', enabled ? 'text-amber-300' : 'text-primary')} />
              <span>
                {enabled
                  ? t('app.effectPreview.performanceOn')
                  : t('app.effectPreview.performanceOff')}
              </span>
            </div>
            <div
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px]',
                enabled ? 'bg-amber-500/15 text-amber-200' : 'bg-primary/15 text-primary'
              )}
            >
              {enabled ? t('app.effectPreview.reduced') : t('app.effectPreview.full')}
            </div>
          </div>
          <div
            className={cn(
              'grid grid-cols-8 items-end gap-1 transition-opacity',
              enabled && 'opacity-35'
            )}
          >
            {bars}
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}

export function NoiseOverlayPreview({ enabled }: IEffectPreviewProps) {
  const { t } = useTranslation('settings');

  return (
    <SettingsPreview title={t('app.effectPreview.noise')}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={t('app.effectPreview.noise')}
      >
        <div className="relative mx-auto h-[120px] max-w-[340px] overflow-hidden rounded-xl border border-border/25 bg-surface/60 p-3">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 18% 25%, rgba(var(--primary-rgb), 0.26), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.06), transparent)',
            }}
          />
          {enabled && (
            <div
              className="absolute inset-0 opacity-35"
              style={{
                backgroundImage:
                  'radial-gradient(circle, rgba(255,255,255,0.45) 0.7px, transparent 0.8px)',
                backgroundSize: '7px 7px',
              }}
            />
          )}
          <div className="relative flex h-full flex-col justify-end gap-2">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <Sparkles className="size-3.5 text-primary" />
              <span>
                {enabled ? t('app.effectPreview.noiseOn') : t('app.effectPreview.noiseOff')}
              </span>
            </div>
            <div className="h-2 w-28 rounded-full bg-foreground/25" />
            <div className="h-1.5 w-20 rounded-full bg-muted-foreground/25" />
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}
