import { MonitorPlay } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import { useSanctuarySection } from './SanctuarySection.hooks';

/**
 * Sanctuary Mode's settings card: the center-stage variant (cover / clock),
 * the opt-in screensaver auto-entry, and its stillness window. The mode
 * itself is entered with `F` while music plays.
 */
export default function SanctuarySection() {
  const {
    title,
    subtitle,
    variantTitle,
    variantDescription,
    variantOptions,
    onSelectVariant,
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
      className={cn(
        'focus-ring rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        option.isActive
          ? 'border border-primary/40 bg-primary/15 text-primary'
          : 'border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
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
