import { Keyboard, PanelsTopLeft, RotateCcw, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  SettingsCard,
  SettingsInfoCallout,
  SettingsRow,
  SettingsRowLabel,
} from '@/components/settings/SettingsCard';
import type { ShortcutActionId } from '@/lib/keymap';
import { useShortcutsSection } from './ShortcutsSection.hooks';
import type { IConflictNotice, IShortcutGroup, IShortcutRow } from './ShortcutsSection.types';

function KeyChips({ keys }: { keys: readonly string[] }) {
  const chips = keys.map((key, i) => (
    <kbd
      key={i}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/60 bg-muted/40 px-1 font-mono text-[0.65rem] font-medium leading-none text-foreground/80"
    >
      {key}
    </kbd>
  ));
  return <span className="flex items-center gap-1">{chips}</span>;
}

interface IShortcutRowItemProps {
  row: IShortcutRow;
  pressKeysLabel: string;
  conflict: IConflictNotice | null;
  onToggleCapture: (id: ShortcutActionId) => void;
  onResetBinding: (id: ShortcutActionId) => void;
}

function ShortcutRowItem({
  row,
  pressKeysLabel,
  conflict,
  onToggleCapture,
  onResetBinding,
}: IShortcutRowItemProps) {
  const showConflict = conflict?.actionId === row.id;
  const showReset = row.modified && !row.capturing;

  return (
    <div className="border-b border-border/20 last:border-b-0">
      <div className="flex items-center gap-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{row.label}</span>
        {showReset && (
          <button
            type="button"
            aria-label={row.resetAria}
            title={row.resetAria}
            onClick={() => onResetBinding(row.id)}
            className="flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          aria-label={row.bindingAria}
          title={row.bindingAria}
          onClick={() => onToggleCapture(row.id)}
          className={cn(
            'flex h-7 min-w-[4.5rem] shrink-0 items-center justify-center rounded-md border px-2 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
            row.capturing
              ? 'border-primary/60 bg-primary/10'
              : 'border-transparent hover:border-border/50 hover:bg-accent/40'
          )}
        >
          {row.capturing ? (
            <span className="animate-pulse text-xs font-medium text-primary">{pressKeysLabel}</span>
          ) : (
            <KeyChips keys={row.keys} />
          )}
        </button>
      </div>
      {showConflict && (
        <p
          role="alert"
          className="mb-2 flex items-center gap-1.5 text-xs leading-snug text-amber-500"
        >
          <TriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {conflict.message}
        </p>
      )}
    </div>
  );
}

export default function ShortcutsSection() {
  const { t, groups, conflict, anyModified, onToggleCapture, onResetBinding, onResetAll } =
    useShortcutsSection();
  const { playback, panelsUi } = groups;

  const renderRows = (group: IShortcutGroup) =>
    group.rows.map(row => (
      <ShortcutRowItem
        key={row.id}
        row={row}
        pressKeysLabel={t('rebind.pressKeys')}
        conflict={conflict}
        onToggleCapture={onToggleCapture}
        onResetBinding={onResetBinding}
      />
    ));

  return (
    <>
      <SettingsCard icon={Keyboard} title={playback.title} subtitle={t('rebind.cardSubtitle')}>
        <SettingsInfoCallout icon={Keyboard}>{t('rebind.hint')}</SettingsInfoCallout>
        <div>{renderRows(playback)}</div>
      </SettingsCard>

      <SettingsCard icon={PanelsTopLeft} title={panelsUi.title} subtitle={t('rebind.cardSubtitle')}>
        <div>{renderRows(panelsUi)}</div>

        <SettingsRow divider>
          <SettingsRowLabel
            label={t('rebind.resetAllTitle')}
            description={t('rebind.resetAllDesc')}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!anyModified}
            onClick={onResetAll}
          >
            {t('rebind.resetAll')}
          </Button>
        </SettingsRow>
      </SettingsCard>
    </>
  );
}
