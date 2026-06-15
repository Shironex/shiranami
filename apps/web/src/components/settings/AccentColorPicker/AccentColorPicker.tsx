import { Check, Pipette, Slash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccentColorPicker } from './AccentColorPicker.hooks';

const SWATCH_BASE = cn(
  'relative grid place-items-center size-9 rounded-full border transition-all',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
);

function swatchRing(isActive: boolean): string {
  return isActive
    ? 'border-primary/70 ring-2 ring-primary/40 scale-110'
    : 'border-border/40 hover:border-border-strong hover:scale-105';
}

function ActiveCheck() {
  return (
    <span className="absolute -top-0.5 -right-0.5 grid place-items-center size-4 rounded-full bg-primary text-primary-foreground shadow">
      <Check className="size-2.5" />
    </span>
  );
}

/**
 * Accent override picker: "auto" (follow the theme), preset swatches, and a
 * free custom color via the native color input. Lives in Settings ·
 * Appearance under the theme card.
 */
export default function AccentColorPicker() {
  const {
    groupLabel,
    autoLabel,
    customLabel,
    accentColor,
    isAuto,
    isCustom,
    swatches,
    customInputValue,
    customInputRef,
    applyLabel,
    onSelectAuto,
    onSelectColor,
    onOpenCustom,
  } = useAccentColorPicker();

  const presetSwatches = swatches.map(swatch => (
    <button
      key={swatch.hex}
      type="button"
      role="radio"
      aria-checked={swatch.isActive}
      aria-label={applyLabel(swatch.name)}
      title={swatch.name}
      onClick={() => onSelectColor(swatch.hex)}
      style={{ backgroundColor: swatch.hex }}
      className={cn(SWATCH_BASE, swatchRing(swatch.isActive))}
    >
      {swatch.isActive && <ActiveCheck />}
    </button>
  ));

  return (
    <div role="radiogroup" aria-label={groupLabel} className="flex flex-wrap items-center gap-2.5">
      {/* Auto — follow the active theme's accent */}
      <button
        type="button"
        role="radio"
        aria-checked={isAuto}
        aria-label={autoLabel}
        title={autoLabel}
        onClick={onSelectAuto}
        className={cn(SWATCH_BASE, 'bg-background', swatchRing(isAuto))}
      >
        <Slash className="size-4 text-muted-foreground" />
        {isAuto && <ActiveCheck />}
      </button>

      {presetSwatches}

      {/* Custom — opens the native color dialog; swatch reflects the picked
          color once one is active, a neutral pipette tile otherwise. */}
      <button
        type="button"
        role="radio"
        aria-checked={isCustom}
        aria-label={customLabel}
        title={customLabel}
        onClick={onOpenCustom}
        style={isCustom ? { backgroundColor: accentColor ?? undefined } : undefined}
        className={cn(SWATCH_BASE, !isCustom && 'bg-secondary', swatchRing(isCustom))}
      >
        {isCustom ? <ActiveCheck /> : <Pipette className="size-3.5 text-muted-foreground" />}
        <input
          ref={customInputRef}
          type="color"
          tabIndex={-1}
          aria-hidden="true"
          value={customInputValue}
          onChange={e => onSelectColor(e.target.value)}
          className="absolute inset-0 opacity-0 pointer-events-none"
        />
      </button>
    </div>
  );
}
