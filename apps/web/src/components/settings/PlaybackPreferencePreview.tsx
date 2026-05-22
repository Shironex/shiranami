import { Clock3, Music2, RadioTower } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsPreview } from '@/components/settings/SettingsPreview';

interface ResumePreviewProps {
  enabled: boolean;
}

interface CrossfadePreviewProps {
  enabled: boolean;
  duration: number;
}

export function ResumePreview({ enabled }: ResumePreviewProps) {
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

export function CrossfadePreview({ enabled, duration }: CrossfadePreviewProps) {
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
