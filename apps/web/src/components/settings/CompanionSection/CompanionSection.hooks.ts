import { useTranslation } from 'react-i18next';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useCompanionStore } from '@/stores/useCompanionStore';
import { useCompanionLedger } from '@/hooks/useCompanionPresence';
import { useDecorativeMotion } from '@/hooks/useDecorativeMotion';
import type { ICompanionSectionView, ICompanionSpeciesOption } from './CompanionSection.types';

/** Proper nouns and kanji — brand constants, never localized. */
const SPECIES_META = [
  { id: 'shio', name: 'Shio', kanji: '潮' },
  { id: 'hotaru', name: 'Hotaru', kanji: '蛍' },
] as const;

export function useCompanionSection(): ICompanionSectionView {
  const { t } = useTranslation('settings');
  const enabled = useInterfaceStore(s => s.companion);
  const setVisible = useInterfaceStore(s => s.setVisible);
  const keepsWatch = useCompanionStore(s => s.sanctuaryKeepsWatch);
  const setKeepsWatch = useCompanionStore(s => s.setSanctuaryKeepsWatch);
  const dressForWeather = useCompanionStore(s => s.dressForWeather);
  const setDressForWeather = useCompanionStore(s => s.setDressForWeather);
  const ledger = useCompanionLedger();
  const motion = useDecorativeMotion();

  const speciesOptions: ICompanionSpeciesOption[] = SPECIES_META.map(meta => ({
    ...meta,
    epithet: t(`app.interface.companion.${meta.id}Epithet`),
    selected: ledger.species === meta.id,
  }));

  const activeName = ledger.name ?? (ledger.species === 'shio' ? 'Shio' : 'Hotaru');

  // Numbers live here and nowhere else — the pet itself is the progress bar.
  // Null while unknown (no ledger yet): silence beats a made-up zero.
  const stageLine =
    ledger.xpHours === null
      ? null
      : ledger.xpHours < 1
        ? t('app.interface.companion.stageLineNew', { name: activeName })
        : t('app.interface.companion.stageLine', { name: activeName, count: ledger.xpHours });

  return {
    t,
    enabled,
    onToggleEnabled: visible => setVisible('companion', visible),
    speciesOptions,
    onSelectSpecies: ledger.setSpecies,
    keepsWatch,
    onToggleKeepsWatch: setKeepsWatch,
    dressForWeather,
    onToggleDressForWeather: setDressForWeather,
    stage: ledger.stage,
    motion,
    stageLine,
  };
}
