import { Clock3, Moon, Music2, RadioTower } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import {
  LOUDNESS_TARGET_MIN_LUFS,
  LOUDNESS_TARGET_MAX_LUFS,
  SLEEP_FADE_MAX_SECONDS,
} from '@/stores/usePlaybackStore';

interface IResumePreviewProps {
  enabled: boolean;
}

interface ICrossfadePreviewProps {
  enabled: boolean;
  duration: number;
}

interface ILoudnessPreviewProps {
  enabled: boolean;
  /** Current target LUFS from the slider; drives the target line position. */
  target: number;
}

export function ResumePreview({ enabled }: IResumePreviewProps) {
  const { t } = useTranslation('settings');

  return (
    <SettingsPreview title={t('play.resumePreview')}>
      <div className="rounded-xl border border-border/30 bg-background/40 p-3">
        <div className="flex items-center gap-3 rounded-lg border border-border/25 bg-surface/60 p-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Clock3 className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <p className="truncate text-xs font-medium text-foreground">
                {t('play.previewTrack')}
              </p>
              <span className="text-[10px] tabular-nums text-muted-foreground/70">
                {enabled ? '1:42' : '0:00'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/35">
              <div
                className="h-full rounded-full bg-primary/55 transition-[width]"
                style={{ width: enabled ? '44%' : '0%' }}
              />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {enabled ? t('play.resumePreviewOn') : t('play.resumePreviewOff')}
            </p>
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}

export function CrossfadePreview({ enabled, duration }: ICrossfadePreviewProps) {
  const { t } = useTranslation('settings');

  return (
    <SettingsPreview title={t('play.crossfadePreview')}>
      <div className="rounded-xl border border-border/30 bg-background/40 p-3">
        <div className="relative overflow-hidden rounded-lg border border-border/25 bg-surface/60 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <Music2 className="size-3.5 text-primary" />
              <span className="truncate">{t('play.previewOutgoing')}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RadioTower className="size-3.5" />
              <span className="truncate">{t('play.previewIncoming')}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted/30">
              <div className="h-full w-[68%] rounded-full bg-primary/45" />
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted/25">
              <div
                className="absolute inset-y-0 rounded-full bg-sky-400/45"
                style={{
                  left: enabled ? '42%' : '68%',
                  width: enabled ? '42%' : '0.5rem',
                }}
              />
              {enabled && (
                <div className="absolute inset-y-0 left-[48%] w-[24%] rounded-full bg-foreground/20 blur-sm" />
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{enabled ? t('play.crossfadePreviewBlend') : t('play.crossfadePreviewCut')}</span>
            <span className="tabular-nums">
              {enabled ? t('play.crossfadePreviewDuration', { seconds: duration }) : '0s'}
            </span>
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}

// A few illustrative tracks at varying perceived loudness (as a 0..1 fraction
// of the bar height). When leveling is OFF they sit at these raw levels; when
// ON they converge toward the shared target line.
const LOUDNESS_BARS = [0.34, 0.86, 0.52, 0.95, 0.68] as const;

export function LoudnessPreview({ enabled, target }: ILoudnessPreviewProps) {
  const { t } = useTranslation('settings');

  // Map the target LUFS onto the bar's 0..1 height (louder target = taller).
  const targetFrac =
    (target - LOUDNESS_TARGET_MIN_LUFS) / (LOUDNESS_TARGET_MAX_LUFS - LOUDNESS_TARGET_MIN_LUFS);
  // Converge each bar toward the target line when leveling is on.
  const levelFor = (raw: number) => (enabled ? targetFrac : raw);

  const bars = LOUDNESS_BARS.map((raw, i) => (
    <div
      key={i}
      className="w-full rounded-full bg-primary/45 transition-[height] duration-300"
      style={{ height: `${Math.max(0.1, levelFor(raw)) * 3.5}rem` }}
    />
  ));

  return (
    <SettingsPreview title={t('play.loudnessPreview')}>
      <div className="rounded-xl border border-border/30 bg-background/40 p-3">
        <div className="relative h-20 rounded-lg border border-border/25 bg-surface/60 px-3 pt-2 pb-3">
          {/* Target loudness line */}
          <div
            className="pointer-events-none absolute inset-x-3 border-t border-dashed border-primary/50 transition-[bottom] duration-300"
            style={{ bottom: `calc(0.75rem + ${targetFrac * 3.5}rem)` }}
          >
            <span className="absolute -top-3.5 right-0 text-[9px] tabular-nums text-primary/70">
              {target} LUFS
            </span>
          </div>

          {/* Track level bars */}
          <div className="flex h-full items-end justify-between gap-2">{bars}</div>
        </div>

        <p className="mt-2 text-[10px] text-muted-foreground">
          {enabled ? t('play.loudnessPreviewOn') : t('play.loudnessPreviewOff')}
        </p>
      </div>
    </SettingsPreview>
  );
}

interface ISleepFadePreviewProps {
  /** Current fade-out duration in seconds; drives the ramp slope. */
  duration: number;
}

const SLEEP_FADE_BARS = 14;

export function SleepFadePreview({ duration }: ISleepFadePreviewProps) {
  const { t } = useTranslation('settings');

  // The tail of the bar row ramps to silence; a longer fade claims more bars,
  // so the slope visibly flattens as the slider grows.
  const fadeBars = Math.max(2, Math.round((duration / SLEEP_FADE_MAX_SECONDS) * SLEEP_FADE_BARS));
  const fadeStart = SLEEP_FADE_BARS - fadeBars;
  const heightFor = (i: number) =>
    i < fadeStart ? 1 : Math.max(0.06, 1 - (i - fadeStart + 1) / fadeBars);

  return (
    <SettingsPreview title={t('play.sleepFadePreview')}>
      <div className="rounded-xl border border-border/30 bg-background/40 p-3">
        <div className="relative h-16 rounded-lg border border-border/25 bg-surface/60 px-3 pt-2 pb-2">
          <Moon className="absolute right-2 top-2 size-3.5 text-primary/60" aria-hidden="true" />
          <div className="flex h-full items-end gap-1">
            {Array.from({ length: SLEEP_FADE_BARS }, (_, i) => (
              <div
                key={i}
                className="w-full rounded-full bg-primary/45 transition-[height] duration-300"
                style={{ height: `${heightFor(i) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {t('play.sleepFadePreviewCaption', { seconds: duration })}
        </p>
      </div>
    </SettingsPreview>
  );
}
