import { Lock, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Companion } from '@/components/companion/Companion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COMPANION_NAME_MAX_LENGTH } from '@/hooks/useCompanionPresence';
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
    showKeepsakes,
    accessoryOptions,
    onToggleAccessory,
    accessories,
    showNameRow,
    name,
    editingName,
    nameDraft,
    onNameDraftChange,
    canSaveName,
    onStartRename,
    onCancelRename,
    onSaveName,
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
        accessories={accessories}
        size={56}
      />
      <span className="flex items-baseline gap-1.5">
        <span className="text-sm font-medium text-foreground">{option.name}</span>
        <span className="text-xs text-muted-foreground/70">{option.kanji}</span>
      </span>
      <span className="text-xs text-muted-foreground -mt-1.5">{option.epithet}</span>
    </button>
  ));

  // Name row — display + inline edit; the whole row needs the ledger.
  const nameRow = showNameRow ? (
    editingName ? (
      <form
        onSubmit={event => {
          event.preventDefault();
          onSaveName();
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={nameDraft}
          onChange={event => onNameDraftChange(event.target.value)}
          aria-label={t('app.interface.companion.nameLabel')}
          maxLength={COMPANION_NAME_MAX_LENGTH}
          className="h-8 max-w-52 text-sm"
          autoFocus
        />
        <Button type="submit" size="sm" disabled={!canSaveName}>
          {t('app.interface.companion.nameSave')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancelRename}>
          {t('app.interface.companion.nameCancel')}
        </Button>
      </form>
    ) : (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">
            {t('app.interface.companion.nameLabel')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {name ?? t('app.interface.companion.nameNone')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onStartRename} disabled={!enabled}>
          {name
            ? t('app.interface.companion.renameAction')
            : t('app.interface.companion.nameAction')}
        </Button>
      </div>
    )
  ) : null;

  const keepsakeChips = accessoryOptions.map(option => (
    <button
      key={option.id}
      type="button"
      onClick={() => onToggleAccessory(option.id)}
      disabled={!enabled || !option.unlocked}
      aria-pressed={option.worn}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        option.worn
          ? 'border-primary/50 bg-primary/10 text-foreground'
          : 'border-border/40 text-muted-foreground hover:border-border/70 hover:bg-accent/30',
        (!enabled || !option.unlocked) && 'opacity-50 cursor-not-allowed hover:bg-transparent'
      )}
    >
      {!option.unlocked && <Lock className="h-3 w-3" aria-hidden="true" />}
      {option.label}
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

      {nameRow}

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

      {/* Keepsakes — one small memento per evolution; locked ones wait quietly. */}
      {showKeepsakes && (
        <div>
          <p className="text-sm font-medium text-foreground leading-snug">
            {t('app.interface.companion.keepsakes')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            {t('app.interface.companion.keepsakesDesc')}
          </p>
          <div className="flex flex-wrap gap-2">{keepsakeChips}</div>
        </div>
      )}

      {stageLine && <p className="text-xs text-muted-foreground/70 italic">{stageLine}</p>}
    </SettingsCard>
  );
}
