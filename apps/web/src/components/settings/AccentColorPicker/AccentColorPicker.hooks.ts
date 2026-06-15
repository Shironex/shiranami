import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccentStore, ACCENT_PRESETS } from '@/stores/useAccentStore';
import type { IAccentColorPickerView, IAccentSwatch } from './AccentColorPicker.types';

const CUSTOM_FALLBACK = '#9b7deb';

export function useAccentColorPicker(): IAccentColorPickerView {
  const { t } = useTranslation('settings');
  const accentColor = useAccentStore(s => s.accentColor);
  const setAccentColor = useAccentStore(s => s.setAccentColor);
  const customInputRef = useRef<HTMLInputElement>(null);

  const isAuto = accentColor === null;
  const isPreset = ACCENT_PRESETS.some(p => p.hex === accentColor);
  const isCustom = accentColor !== null && !isPreset;

  const swatches: IAccentSwatch[] = ACCENT_PRESETS.map(preset => ({
    hex: preset.hex,
    name: t(`app.accent.names.${preset.nameKey}`),
    isActive: accentColor === preset.hex,
  }));

  return {
    groupLabel: t('app.accent.title'),
    autoLabel: t('app.accent.auto'),
    customLabel: t('app.accent.custom'),
    accentColor,
    isAuto,
    isCustom,
    swatches,
    customInputValue: accentColor ?? CUSTOM_FALLBACK,
    customInputRef,
    applyLabel: name => t('app.accent.apply', { name }),
    onSelectAuto: () => setAccentColor(null),
    onSelectColor: setAccentColor,
    onOpenCustom: () => customInputRef.current?.click(),
  };
}
