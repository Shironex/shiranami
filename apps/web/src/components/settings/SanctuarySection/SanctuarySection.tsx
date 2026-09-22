import { MonitorPlay } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SettingsCard,
  SettingsSelectRow,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import { useSanctuarySection } from './SanctuarySection.hooks';

/** Shared chip styling for the section's three pressed-state pickers. */
function chipClass(isActive: boolean): string {
  return cn(
    'focus-ring rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
    'disabled:opacity-40 disabled:pointer-events-none',
    isActive
      ? 'border border-primary/40 bg-primary/15 text-primary'
      : 'border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
  );
}

/**
 * Sanctuary Mode's settings card: the center-stage variant (cover / clock /
 * vinyl), per-stage track details, the follow-the-day scenes, stage rotation,
 * the clock's face / hour format / seconds, and the opt-in screensaver
 * auto-entry with its stillness window. Every depth control lives here — the
 * sanctuary itself keeps only its two chrome buttons. The mode is entered
 * with `F` while music plays.
 */
export default function SanctuarySection() {
  const {
    title,
    subtitle,
    variantTitle,
    variantDescription,
    variantOptions,
    variantsDisabled,
    onSelectVariant,
    trackInfoTitle,
    trackInfoDescription,
    trackInfoOptions,
    onToggleTrackInfo,
    timeOfDayLabel,
    timeOfDayDescription,
    timeOfDay,
    onTimeOfDayChange,
    rotationLabel,
    rotationDescription,
    rotation,
    rotationOptions,
    rotationDisabled,
    onRotationChange,
    showRotationMinutes,
    rotationMinutesTitle,
    rotationMinutesDescription,
    rotationMinutesLabel,
    rotationMinutes,
    rotationMinutesMin,
    rotationMinutesMax,
    onRotationMinutesChange,
    clockFaceTitle,
    clockFaceDescription,
    clockFaceOptions,
    onSelectClockFace,
    clockFormatLabel,
    clockFormatDescription,
    clockFormat,
    clockFormatOptions,
    onClockFormatChange,
    clockSecondsLabel,
    clockSecondsDescription,
    clockSeconds,
    onClockSecondsChange,
    autoEnterLabel,
    autoEnterDescription,
    autoEnter,
    onAutoEnterChange,
    minutesTitle,
    minutesDescription,
    minutesLabel,
    minutes,
    minutesMin,
    minutesMax,
    onMinutesChange,
  } = useSanctuarySection();

  const variantChips = variantOptions.map(option => (
    <button
      key={option.value}
      onClick={() => onSelectVariant(option.value)}
      aria-pressed={option.isActive}
      disabled={variantsDisabled}
      className={chipClass(option.isActive)}
    >
      {option.label}
    </button>
  ));

  // Same visible labels as the variant chips — the aria-label disambiguates
  // the two pickers for assistive tech.
  const trackInfoChips = trackInfoOptions.map(option => (
    <button
      key={option.value}
      onClick={() => onToggleTrackInfo(option.value)}
      aria-pressed={option.isShown}
      aria-label={`${trackInfoTitle}: ${option.label}`}
      className={chipClass(option.isShown)}
    >
      {option.label}
    </button>
  ));

  const clockFaceChips = clockFaceOptions.map(option => (
    <button
      key={option.value}
      onClick={() => onSelectClockFace(option.value)}
      aria-pressed={option.isActive}
      className={chipClass(option.isActive)}
    >
      {option.label}
    </button>
  ));

  return (
    <SettingsCard icon={MonitorPlay} title={title} subtitle={subtitle}>
      <div className="px-3" data-slot="sanctuary-section">
        <p className="mb-1 text-sm font-medium text-foreground">{variantTitle}</p>
        <p className="mb-3 text-xs text-muted-foreground">{variantDescription}</p>
        <div className="flex items-center gap-1.5">{variantChips}</div>
      </div>

      <div className="border-t border-border/30 px-3 pt-3.5">
        <p className="mb-1 text-sm font-medium text-foreground">{trackInfoTitle}</p>
        <p className="mb-3 text-xs text-muted-foreground">{trackInfoDescription}</p>
        <div className="flex items-center gap-1.5">{trackInfoChips}</div>
      </div>

      <SettingsToggleRow
        label={timeOfDayLabel}
        description={timeOfDayDescription}
        checked={timeOfDay}
        onCheckedChange={onTimeOfDayChange}
        divider
      />

      <SettingsSelectRow
        label={rotationLabel}
        description={rotationDescription}
        value={rotation}
        onValueChange={onRotationChange}
        options={rotationOptions}
        disabled={rotationDisabled}
        divider
      />

      {showRotationMinutes && (
        <div className="px-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{rotationMinutesTitle}</p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {rotationMinutesLabel}
            </span>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">{rotationMinutesDescription}</p>
          <Slider
            min={rotationMinutesMin}
            max={rotationMinutesMax}
            step={1}
            value={[rotationMinutes]}
            onValueChange={([v]) => onRotationMinutesChange(v)}
          />
        </div>
      )}

      <div className="border-t border-border/30 px-3 pt-3.5">
        <p className="mb-1 text-sm font-medium text-foreground">{clockFaceTitle}</p>
        <p className="mb-3 text-xs text-muted-foreground">{clockFaceDescription}</p>
        <div className="flex items-center gap-1.5">{clockFaceChips}</div>
      </div>

      <SettingsSelectRow
        label={clockFormatLabel}
        description={clockFormatDescription}
        value={clockFormat}
        onValueChange={onClockFormatChange}
        options={clockFormatOptions}
      />

      <SettingsToggleRow
        label={clockSecondsLabel}
        description={clockSecondsDescription}
        checked={clockSeconds}
        onCheckedChange={onClockSecondsChange}
      />

      <SettingsToggleRow
        label={autoEnterLabel}
        description={autoEnterDescription}
        checked={autoEnter}
        onCheckedChange={onAutoEnterChange}
        divider
      />

      {autoEnter && (
        <div className="px-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{minutesTitle}</p>
            <span className="text-xs tabular-nums text-muted-foreground">{minutesLabel}</span>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">{minutesDescription}</p>
          <Slider
            min={minutesMin}
            max={minutesMax}
            step={1}
            value={[minutes]}
            onValueChange={([v]) => onMinutesChange(v)}
          />
        </div>
      )}
    </SettingsCard>
  );
}
