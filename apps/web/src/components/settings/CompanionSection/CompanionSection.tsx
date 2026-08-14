import { Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Companion } from '@/components/companion/Companion';
import { useCompanionSection } from './CompanionSection.hooks';

/**
 * Settings → Interface → Companion. The master toggle, the species picker —
 * both residents previewed live at perch size, at the stage the listener has
 * actually reached — the Sanctuary "keeps watch" sub-toggle, and the one
 * prose line where numbers are allowed to exist. No XP bar anywhere: the pet
 * is the progress bar.
 */
export default function CompanionSection() {
  const {
    t,
    enabled,
    onToggleEnabled,
    speciesOptions,
    onSelectSpecies,
    keepsWatch,
    onToggleKeepsWatch,
    dressForWeather,
    onToggleDressForWeather,
    stage,
    motion,
    stageLine,
  } = useCompanionSection();

  const speciesButtons = speciesOptions.map(option => (
    <button
      key={option.id}
      type="button"
      onClick={() => onSelectSpecies(option.id)}
      disabled={!enabled}
      aria-pressed={option.selected}
      className={cn(
        'flex-1 flex flex-col items-center gap-2 rounded-xl border px-4 pt-5 pb-3',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        option.selected
          ? 'border-primary/50 bg-primary/10'
          : 'border-border/40 hover:border-border/70 hover:bg-accent/30',
        !enabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <Companion
        species={option.id}
        stage={stage}
        mode={enabled ? 'listening' : 'sleeping'}
        motion={motion && enabled}
        size={56}
      />
      <span className="flex items-baseline gap-1.5">
        <span className="text-sm font-medium text-foreground">{option.name}</span>
        <span className="text-xs text-muted-foreground/70">{option.kanji}</span>
      </span>
      <span className="text-xs text-muted-foreground -mt-1.5">{option.epithet}</span>
    </button>
  ));

  return (
    <SettingsCard
      icon={Waves}
      title={t('app.interface.companion.title')}
      subtitle={t('app.interface.companion.desc')}
    >
      <SettingsToggleRow
        label={t('app.interface.companion.enable')}
        description={t('app.interface.companion.enableDesc')}
        checked={enabled}
        onCheckedChange={onToggleEnabled}
      />

      {/* Species picker — this is how the listener chooses who lives here. */}
      <div>
        <p className="text-sm font-medium text-foreground leading-snug mb-2">
          {t('app.interface.companion.speciesLabel')}
        </p>
        <div className="flex gap-3">{speciesButtons}</div>
      </div>

      <SettingsToggleRow
        label={t('app.interface.companion.keepsWatch')}
        description={t('app.interface.companion.keepsWatchDesc')}
        checked={keepsWatch}
        onCheckedChange={onToggleKeepsWatch}
        disabled={!enabled}
        divider
      />

      <SettingsToggleRow
        label={t('app.interface.companion.dressForWeather')}
        description={t('app.interface.companion.dressForWeatherDesc')}
        checked={dressForWeather}
        onCheckedChange={onToggleDressForWeather}
        disabled={!enabled}
        divider
      />

      {stageLine && <p className="text-xs text-muted-foreground/70 italic">{stageLine}</p>}
    </SettingsCard>
  );
}
