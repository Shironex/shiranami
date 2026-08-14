import { Check, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBackgroundLibraryManager } from './BackgroundLibraryManager.hooks';

const CHIP_ACTIVE = 'border border-primary/40 bg-primary/15 text-primary';
const CHIP_IDLE =
  'border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground';

/**
 * The saved-background manager inside Settings · Appearance: the tile grid
 * with add/rename/remove, plus the selection-mode controls (the user's pick,
 * a rotation, or a time-of-day schedule that reuses the room-light stops).
 */
export default function BackgroundLibraryManager() {
  const {
    tiles,
    onSelectTile,
    onRemoveTile,
    addLabel,
    onAdd,
    isAdding,
    canAdd,
    hint,
    fullHint,
    editingId,
    editingLabel,
    onStartRename,
    onEditingLabelChange,
    onCommitRename,
    onCancelRename,
    saveLabel,
    cancelLabel,
    showModeControls,
    modeTitle,
    modeDescription,
    modeOptions,
    onSelectMode,
    showIntervalControls,
    intervalTitle,
    intervalDescription,
    intervalOptions,
    onSelectInterval,
    showScheduleControls,
    scheduleTitle,
    scheduleDescription,
    scheduleRows,
    scheduleOptions,
    onSetScheduleSlot,
  } = useBackgroundLibraryManager();

  const tileItems = tiles.map(tile => (
    // A div, not one big button: the tile carries three actions (select,
    // rename, remove) and nesting buttons inside a button is invalid markup
    // that screen readers flatten unpredictably.
    <div key={tile.id} className="group relative aspect-video overflow-hidden rounded-xl">
      <button
        type="button"
        aria-pressed={tile.isActive}
        aria-label={tile.selectLabel}
        onClick={() => onSelectTile(tile.id)}
        className={cn(
          'absolute inset-0 rounded-xl border text-left transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          tile.isActive
            ? 'border-primary/60 ring-1 ring-primary/40'
            : 'border-border/40 hover:border-border/60'
        )}
      >
        {tile.thumbUrl ? (
          <img
            src={tile.thumbUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full rounded-xl object-cover"
            draggable={false}
          />
        ) : (
          <span className="absolute inset-0 rounded-xl bg-background" />
        )}
        <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {tile.label}
        </span>
        {tile.isActive && (
          <span className="absolute top-1.5 left-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow">
            <Check className="h-3 w-3" />
          </span>
        )}
      </button>
      <div
        className={cn(
          'absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 transition-opacity',
          'group-hover:opacity-100 group-focus-within:opacity-100'
        )}
      >
        <button
          type="button"
          aria-label={tile.renameLabel}
          onClick={() => onStartRename(tile.id)}
          className="grid h-6 w-6 place-items-center rounded-md bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label={tile.removeLabel}
          onClick={() => onRemoveTile(tile.id)}
          className="grid h-6 w-6 place-items-center rounded-md bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-destructive/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  ));

  const modeChips = modeOptions.map(option => (
    <button
      key={option.value}
      onClick={() => onSelectMode(option.value)}
      aria-pressed={option.isActive}
      className={cn(
        'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        option.isActive ? CHIP_ACTIVE : CHIP_IDLE
      )}
    >
      {option.label}
    </button>
  ));

  const intervalChips = intervalOptions.map(option => (
    <button
      key={option.value}
      onClick={() => onSelectInterval(option.value)}
      aria-pressed={option.isActive}
      className={cn(
        'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        option.isActive ? CHIP_ACTIVE : CHIP_IDLE
      )}
    >
      {option.label}
    </button>
  ));

  const scheduleOptionItems = scheduleOptions.map(option => (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  ));

  const scheduleRowItems = scheduleRows.map(row => (
    <div key={row.slot} className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-foreground">{row.label}</span>
      <Select value={row.value} onValueChange={value => onSetScheduleSlot(row.slot, value)}>
        <SelectTrigger aria-label={row.label} className="min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{scheduleOptionItems}</SelectContent>
      </Select>
    </div>
  ));

  return (
    <div className="space-y-4 px-3" data-slot="background-library">
      <div className="grid grid-cols-3 gap-2.5">
        {tileItems}
        {/* aria-disabled rather than disabled: a `disabled` button under the
            user's focus leaves the a11y tree and blurs to <body>, and an
            import runs for seconds on a large GIF — they would be tabbing from
            the top of the document by the time it finished. */}
        <button
          type="button"
          onClick={onAdd}
          aria-disabled={isAdding || !canAdd}
          aria-busy={isAdding}
          aria-describedby="bg-library-hint"
          className={cn(
            'flex aspect-video flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 text-xs font-medium text-muted-foreground transition-colors',
            'hover:border-border hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'aria-disabled:pointer-events-none aria-disabled:opacity-60'
          )}
        >
          <ImagePlus className="size-4" />
          {addLabel}
        </button>
      </div>
      <p id="bg-library-hint" className="text-[11px] text-muted-foreground">
        {fullHint ?? hint}
      </p>

      {editingId !== null && (
        <div className="flex items-center gap-2" data-slot="background-rename">
          <Input
            value={editingLabel}
            onChange={event => onEditingLabelChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') onCommitRename();
              if (event.key === 'Escape') onCancelRename();
            }}
            maxLength={60}
            autoFocus
            className="h-8 flex-1 text-xs"
          />
          <button
            type="button"
            onClick={onCommitRename}
            className="rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {saveLabel}
          </button>
          <button
            type="button"
            onClick={onCancelRename}
            className="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {cancelLabel}
          </button>
        </div>
      )}

      {showModeControls && (
        <div data-slot="background-mode">
          <p className="mb-1 text-sm font-medium text-foreground">{modeTitle}</p>
          <p className="mb-3 text-xs text-muted-foreground">{modeDescription}</p>
          <div className="flex flex-wrap items-center gap-1.5">{modeChips}</div>
        </div>
      )}

      {showIntervalControls && (
        <div data-slot="background-rotation">
          <p className="mb-1 text-sm font-medium text-foreground">{intervalTitle}</p>
          <p className="mb-3 text-xs text-muted-foreground">{intervalDescription}</p>
          <div className="flex flex-wrap items-center gap-1.5">{intervalChips}</div>
        </div>
      )}

      {showScheduleControls && (
        <div data-slot="background-schedule">
          <p className="mb-1 text-sm font-medium text-foreground">{scheduleTitle}</p>
          <p className="mb-3 text-xs text-muted-foreground">{scheduleDescription}</p>
          <div className="space-y-2">{scheduleRowItems}</div>
        </div>
      )}
    </div>
  );
}
