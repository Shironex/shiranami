import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Pipette, Slash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccentStore, ACCENT_PRESETS } from '@/stores/useAccentStore';

const SWATCH_BASE = cn(
  'relative grid place-items-center size-9 rounded-full border transition-all',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
);

function swatchRing(isActive: boolean) {
  return isActive
    ? 'border-primary/70 ring-2 ring-primary/40 scale-110'
    : 'border-border/40 hover:border-border-strong hover:scale-105';
}

/**
 * Accent override picker: "auto" (follow the theme), preset swatches, and a
 * free custom color via the native color input. Lives in Settings ·
 * Appearance under the theme card.
 */
export function AccentColorPicker() {
  const { t } = useTranslation('settings');
  const accentColor = useAccentStore(s => s.accentColor);
  const setAccentColor = useAccentStore(s => s.setAccentColor);
  const customInputRef = useRef<HTMLInputElement>(null);

  const isPreset = ACCENT_PRESETS.some(p => p.hex === accentColor);
  const isCustom = accentColor !== null && !isPreset;

  return (
    <div
      role="radiogroup"
      aria-label={t('app.accent.title')}
      className="flex flex-wrap items-center gap-2.5"
    >
      {/* Auto — follow the active theme's accent */}
      <button
        type="button"
        role="radio"
        aria-checked={accentColor === null}
        aria-label={t('app.accent.auto')}
        title={t('app.accent.auto')}
        onClick={() => setAccentColor(null)}
        className={cn(SWATCH_BASE, 'bg-background', swatchRing(accentColor === null))}
      >
        <Slash className="size-4 text-muted-foreground" />
        {accentColor === null && <ActiveCheck />}
      </button>

      {ACCENT_PRESETS.map(preset => {
        const isActive = accentColor === preset.hex;
        const name = t(`app.accent.names.${preset.nameKey}`);
        return (
          <button
            key={preset.hex}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={t('app.accent.apply', { name })}
            title={name}
            onClick={() => setAccentColor(preset.hex)}
            style={{ backgroundColor: preset.hex }}
            className={cn(SWATCH_BASE, swatchRing(isActive))}
          >
            {isActive && <ActiveCheck />}
          </button>
        );
      })}

      {/* Custom — opens the native color dialog; swatch reflects the picked
          color once one is active, a neutral pipette tile otherwise. */}
      <button
        type="button"
        role="radio"
        aria-checked={isCustom}
        aria-label={t('app.accent.custom')}
        title={t('app.accent.custom')}
        onClick={() => customInputRef.current?.click()}
        style={isCustom ? { backgroundColor: accentColor } : undefined}
        className={cn(SWATCH_BASE, !isCustom && 'bg-secondary', swatchRing(isCustom))}
      >
        {isCustom ? <ActiveCheck /> : <Pipette className="size-3.5 text-muted-foreground" />}
        <input
          ref={customInputRef}
          type="color"
          tabIndex={-1}
          aria-hidden="true"
          value={accentColor ?? '#9b7deb'}
          onChange={e => setAccentColor(e.target.value)}
          className="absolute inset-0 opacity-0 pointer-events-none"
        />
      </button>
    </div>
  );
}

function ActiveCheck() {
  return (
    <span className="absolute -top-0.5 -right-0.5 grid place-items-center size-4 rounded-full bg-primary text-primary-foreground shadow">
      <Check className="size-2.5" />
    </span>
  );
}
