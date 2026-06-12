import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import {
  CrossfadePreview,
  ResumePreview,
  LoudnessPreview,
  SleepFadePreview,
} from '@/components/settings/PlaybackPreferencePreview';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  usePlaybackStore,
  SLEEP_FADE_MIN_SECONDS,
  SLEEP_FADE_MAX_SECONDS,
  LOUDNESS_TARGET_MIN_LUFS,
  LOUDNESS_TARGET_MAX_LUFS,
} from '@/stores/usePlaybackStore';
import { useLoudnessAnalysis } from '@/hooks/useLoudnessAnalysis';
import { useSettingsQuery, useUpdateSettingsMutation } from '@/hooks/queries/useSettings';

export function PlaybackSection() {
  const { t } = useTranslation('settings');
  const { data: settings } = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();

  const rememberPlaybackPosition = settings?.rememberPlaybackPosition ?? false;

  const crossfadeEnabled = usePlaybackStore(s => s.crossfadeEnabled);
  const crossfadeDuration = usePlaybackStore(s => s.crossfadeDuration);
  const setCrossfadeEnabled = usePlaybackStore(s => s.setCrossfadeEnabled);
  const setCrossfadeDuration = usePlaybackStore(s => s.setCrossfadeDuration);

  const sleepFadeDuration = usePlaybackStore(s => s.sleepFadeDuration);
  const setSleepFadeDuration = usePlaybackStore(s => s.setSleepFadeDuration);

  const loudnessEnabled = usePlaybackStore(s => s.loudnessEnabled);
  const loudnessTargetLufs = usePlaybackStore(s => s.loudnessTargetLufs);
  const setLoudnessEnabled = usePlaybackStore(s => s.setLoudnessEnabled);
  const setLoudnessTargetLufs = usePlaybackStore(s => s.setLoudnessTargetLufs);
  const loudness = useLoudnessAnalysis();

  const updateSetting = (key: 'rememberPlaybackPosition', value: boolean) => {
    updateSettings.mutate({ [key]: value });
  };

  return (
    <SettingsCard icon={Settings2} title={t('play.title')} subtitle={t('play.subtitle')}>
      <div>
        <SettingsToggleRow
          label={t('play.rememberPosition')}
          description={t('play.rememberDesc')}
          checked={rememberPlaybackPosition}
          onCheckedChange={v => updateSetting('rememberPlaybackPosition', v)}
        />
        <ResumePreview enabled={rememberPlaybackPosition} />

        <SettingsToggleRow
          divider
          label={t('play.crossfade')}
          description={t('play.crossfadeDesc')}
          checked={crossfadeEnabled}
          onCheckedChange={setCrossfadeEnabled}
        />
        <CrossfadePreview enabled={crossfadeEnabled} duration={crossfadeDuration} />

        {crossfadeEnabled && (
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{t('play.duration')}</p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {crossfadeDuration}s
              </span>
            </div>
            <Slider
              min={1}
              max={12}
              step={1}
              value={[crossfadeDuration]}
              onValueChange={([v]) => setCrossfadeDuration(v)}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground/60">1s</span>
              <span className="text-[10px] text-muted-foreground/60">12s</span>
            </div>
          </div>
        )}

        <SettingsToggleRow
          divider
          label={t('play.loudness')}
          description={t('play.loudnessDesc')}
          checked={loudnessEnabled}
          onCheckedChange={setLoudnessEnabled}
        />
        <LoudnessPreview enabled={loudnessEnabled} target={loudnessTargetLufs} />

        {loudnessEnabled && (
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{t('play.loudnessTarget')}</p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {loudnessTargetLufs} LUFS
              </span>
            </div>
            <Slider
              min={LOUDNESS_TARGET_MIN_LUFS}
              max={LOUDNESS_TARGET_MAX_LUFS}
              step={1}
              value={[loudnessTargetLufs]}
              onValueChange={([v]) => setLoudnessTargetLufs(v)}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground/60">
                {LOUDNESS_TARGET_MIN_LUFS} LUFS
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                {LOUDNESS_TARGET_MAX_LUFS} LUFS
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 mt-3">
              <p className="text-xs text-muted-foreground">
                {loudness.running
                  ? t('play.loudnessAnalyzing', {
                      current: loudness.current,
                      total: loudness.total,
                    })
                  : t('play.loudnessAnalyzeDesc')}
              </p>
              {loudness.running ? (
                <Button variant="ghost" size="sm" onClick={loudness.cancel}>
                  {t('play.loudnessCancel')}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => void loudness.start()}>
                  {t('play.loudnessAnalyze')}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="px-3 pt-3 pb-1 border-t border-border/40 mt-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">{t('play.sleepFade')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('play.sleepFadeDesc')}</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 mb-2">
            <p className="text-sm text-muted-foreground">{t('play.sleepFadeDuration')}</p>
            <span className="text-xs tabular-nums text-muted-foreground">{sleepFadeDuration}s</span>
          </div>
          <Slider
            min={SLEEP_FADE_MIN_SECONDS}
            max={SLEEP_FADE_MAX_SECONDS}
            step={1}
            value={[sleepFadeDuration]}
            onValueChange={([v]) => setSleepFadeDuration(v)}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground/60">{SLEEP_FADE_MIN_SECONDS}s</span>
            <span className="text-[10px] text-muted-foreground/60">{SLEEP_FADE_MAX_SECONDS}s</span>
          </div>
        </div>
        <SleepFadePreview duration={sleepFadeDuration} />
      </div>
    </SettingsCard>
  );
}
