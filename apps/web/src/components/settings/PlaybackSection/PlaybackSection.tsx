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
import { usePlaybackSection } from './PlaybackSection.hooks';

export default function PlaybackSection() {
  const {
    title,
    subtitle,
    resumeLabel,
    resumeDescription,
    rememberPlaybackPosition,
    onRememberChange,
    crossfadeLabel,
    crossfadeDescription,
    crossfadeEnabled,
    onCrossfadeEnabledChange,
    durationLabel,
    crossfadeDuration,
    crossfadeMin,
    crossfadeMax,
    onCrossfadeDurationChange,
    loudnessLabel,
    loudnessDescription,
    loudnessEnabled,
    onLoudnessEnabledChange,
    loudnessTargetLabel,
    loudnessTargetLufs,
    loudnessMin,
    loudnessMax,
    onLoudnessTargetChange,
    loudnessAnalysisRunning,
    loudnessAnalysisStatus,
    loudnessAnalyzeLabel,
    loudnessCancelLabel,
    onStartLoudnessAnalysis,
    onCancelLoudnessAnalysis,
    analysisLabel,
    analysisDescription,
    analysisRunning,
    analysisStatus,
    analysisAnalyzeLabel,
    analysisCancelLabel,
    onStartAnalysis,
    onCancelAnalysis,
    sleepFadeLabel,
    sleepFadeDescription,
    sleepFadeDurationLabel,
    sleepFadeDuration,
    sleepFadeMin,
    sleepFadeMax,
    onSleepFadeDurationChange,
  } = usePlaybackSection();

  return (
    <SettingsCard icon={Settings2} title={title} subtitle={subtitle}>
      <div>
        <SettingsToggleRow
          label={resumeLabel}
          description={resumeDescription}
          checked={rememberPlaybackPosition}
          onCheckedChange={onRememberChange}
        />
        <ResumePreview enabled={rememberPlaybackPosition} />

        <SettingsToggleRow
          divider
          label={crossfadeLabel}
          description={crossfadeDescription}
          checked={crossfadeEnabled}
          onCheckedChange={onCrossfadeEnabledChange}
        />
        <CrossfadePreview enabled={crossfadeEnabled} duration={crossfadeDuration} />

        {crossfadeEnabled && (
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{durationLabel}</p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {crossfadeDuration}s
              </span>
            </div>
            <Slider
              min={crossfadeMin}
              max={crossfadeMax}
              step={1}
              value={[crossfadeDuration]}
              onValueChange={([v]) => onCrossfadeDurationChange(v)}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground/60">{crossfadeMin}s</span>
              <span className="text-[10px] text-muted-foreground/60">{crossfadeMax}s</span>
            </div>
          </div>
        )}

        <SettingsToggleRow
          divider
          label={loudnessLabel}
          description={loudnessDescription}
          checked={loudnessEnabled}
          onCheckedChange={onLoudnessEnabledChange}
        />
        <LoudnessPreview enabled={loudnessEnabled} target={loudnessTargetLufs} />

        {loudnessEnabled && (
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{loudnessTargetLabel}</p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {loudnessTargetLufs} LUFS
              </span>
            </div>
            <Slider
              min={loudnessMin}
              max={loudnessMax}
              step={1}
              value={[loudnessTargetLufs]}
              onValueChange={([v]) => onLoudnessTargetChange(v)}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground/60">{loudnessMin} LUFS</span>
              <span className="text-[10px] text-muted-foreground/60">{loudnessMax} LUFS</span>
            </div>

            <div className="flex items-center justify-between gap-3 mt-3">
              <p className="text-xs text-muted-foreground">{loudnessAnalysisStatus}</p>
              {loudnessAnalysisRunning ? (
                <Button variant="ghost" size="sm" onClick={onCancelLoudnessAnalysis}>
                  {loudnessCancelLabel}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={onStartLoudnessAnalysis}>
                  {loudnessAnalyzeLabel}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="px-3 pt-3 pb-1 border-t border-border/40 mt-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-foreground">{analysisLabel}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{analysisDescription}</p>
              <p className="text-xs text-muted-foreground mt-1">{analysisStatus}</p>
            </div>
            {analysisRunning ? (
              <Button variant="ghost" size="sm" onClick={onCancelAnalysis}>
                {analysisCancelLabel}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={onStartAnalysis}>
                {analysisAnalyzeLabel}
              </Button>
            )}
          </div>
        </div>

        <div className="px-3 pt-3 pb-1 border-t border-border/40 mt-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">{sleepFadeLabel}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sleepFadeDescription}</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 mb-2">
            <p className="text-sm text-muted-foreground">{sleepFadeDurationLabel}</p>
            <span className="text-xs tabular-nums text-muted-foreground">{sleepFadeDuration}s</span>
          </div>
          <Slider
            min={sleepFadeMin}
            max={sleepFadeMax}
            step={1}
            value={[sleepFadeDuration]}
            onValueChange={([v]) => onSleepFadeDurationChange(v)}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground/60">{sleepFadeMin}s</span>
            <span className="text-[10px] text-muted-foreground/60">{sleepFadeMax}s</span>
          </div>
        </div>
        <SleepFadePreview duration={sleepFadeDuration} />
      </div>
    </SettingsCard>
  );
}
