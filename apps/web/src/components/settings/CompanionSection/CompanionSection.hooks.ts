import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useCompanionStore } from '@/stores/useCompanionStore';
import { COMPANION_NAME_MAX_LENGTH, useCompanionLedger } from '@/hooks/useCompanionPresence';
import { useDecorativeMotion } from '@/hooks/useDecorativeMotion';
import {
  COMPANION_ACCESSORIES,
  isAccessoryUnlocked,
  type CompanionAccessory,
} from '@/lib/companionAccessories';
import type {
  ICompanionAccessoryOption,
  ICompanionSectionView,
  ICompanionSpeciesOption,
} from './CompanionSection.types';

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

  // Keepsakes belong to the pet, not the species (they survive the switch),
  // so the picker lives here and both previews wear the chosen set.
  const accessoryOptions: ICompanionAccessoryOption[] = COMPANION_ACCESSORIES.map(meta => ({
    id: meta.id,
    label: t(`app.interface.companion.keepsake_${meta.id}`),
    worn: ledger.accessories.includes(meta.id),
    unlocked: isAccessoryUnlocked(meta.id, ledger.stage),
  }));

  const onToggleAccessory = (id: CompanionAccessory) => {
    const next = ledger.accessories.includes(id)
      ? ledger.accessories.filter(worn => worn !== id)
      : [...ledger.accessories, id];
    ledger.setAccessories(next);
  };

  // The rename affordance: a small inline edit, ledger-backed like the name
  // itself. The naming *ceremony* is the perch's one-time moment; this row is
  // for every day after (and for whoever waved the ceremony away).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const onStartRename = () => {
    setNameDraft(ledger.name ?? '');
    setEditingName(true);
  };
  const onCancelRename = () => setEditingName(false);
  const onSaveName = () => {
    if (nameDraft.trim().length === 0) return;
    ledger.setName(nameDraft);
    setEditingName(false);
  };

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
    // The wardrobe needs the ledger — without it nothing would persist, so
    // the row simply doesn't exist rather than pretending (browser dev).
    showKeepsakes: ledger.hasBackend,
    accessoryOptions,
    onToggleAccessory,
    accessories: ledger.accessories,
    // Same ledger dependency as the wardrobe, same honesty.
    showNameRow: ledger.hasBackend,
    name: ledger.name,
    editingName,
    nameDraft,
    onNameDraftChange: value => setNameDraft(value.slice(0, COMPANION_NAME_MAX_LENGTH)),
    canSaveName: nameDraft.trim().length > 0,
    onStartRename,
    onCancelRename,
    onSaveName,
    stage: ledger.stage,
    motion,
    stageLine,
  };
}
