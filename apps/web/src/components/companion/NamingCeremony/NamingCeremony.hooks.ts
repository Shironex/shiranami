import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { COMPANION_NAME_MAX_LENGTH, useCompanionLedger } from '@/hooks/useCompanionPresence';
import { useDecorativeMotion } from '@/hooks/useDecorativeMotion';
import { useCompanionStore } from '@/stores/useCompanionStore';
import { useCompanionRuntimeStore } from '@/stores/useCompanionRuntimeStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { useSanctuaryStore } from '@/stores/useSanctuaryStore';
import type { INamingCeremonyView } from './NamingCeremony.types';

export function useNamingCeremony(): INamingCeremonyView {
  const { t } = useTranslation('companion');
  const ledger = useCompanionLedger();
  const enabled = useInterfaceStore(s => s.companion);
  const ceremonyDone = useCompanionStore(s => s.namingCeremonyDone);
  const setCeremonyDone = useCompanionStore(s => s.setNamingCeremonyDone);
  // Wait out the level-up celebration — the ceremony follows the moment, it
  // never talks over it.
  const celebrating = useCompanionRuntimeStore(s => s.machine.overlay === 'levelup');
  const compactMode = useCompactStore(s => s.compactMode);
  const sanctuaryActive = useSanctuaryStore(s => s.sanctuaryActive);
  const motion = useDecorativeMotion();
  const [draft, setDraft] = useState('');

  // Due when the first evolution has been reached (covering both "just
  // leveled" and "enabled with hours already behind it"), the pet is still
  // nameless, the ledger exists to remember the answer, and no immersive
  // surface (compact, sanctuary) is up. One-time: passing on it stamps
  // `namingCeremonyDone` forever — the Settings rename remains.
  const open =
    enabled &&
    !ceremonyDone &&
    ledger.hasBackend &&
    ledger.name === null &&
    ledger.stage >= 1 &&
    !celebrating &&
    !compactMode &&
    !sanctuaryActive;

  const fallbackName = ledger.species === 'shio' ? 'Shio' : 'Hotaru';
  const trimmed = draft.trim();

  const onConfirm = () => {
    if (trimmed.length === 0) return;
    ledger.setName(trimmed);
    setCeremonyDone();
  };

  return {
    t,
    open,
    species: ledger.species,
    stage: ledger.stage,
    motion,
    fallbackName,
    draft,
    onDraftChange: value => setDraft(value.slice(0, COMPANION_NAME_MAX_LENGTH)),
    canConfirm: trimmed.length > 0,
    onConfirm,
    onLater: setCeremonyDone,
  };
}
