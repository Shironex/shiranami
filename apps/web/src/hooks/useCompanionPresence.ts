import { useCallback, useEffect } from 'react';
import { ensureCompanionDriver } from '@/lib/companionDriver';
import { getCompanionApi } from '@/lib/companionBackend';
import { useCompanionRuntimeStore } from '@/stores/useCompanionRuntimeStore';
import { useCompanionStore } from '@/stores/useCompanionStore';
import { useDecorativeMotion } from '@/hooks/useDecorativeMotion';
import type {
  CompanionMode,
  CompanionOverlay,
  CompanionSpecies,
  CompanionStage,
} from '@/lib/companionMachine';

/** What a surface needs to render the resident. */
export interface ICompanionPresence {
  readonly species: CompanionSpecies;
  readonly stage: CompanionStage;
  readonly mode: CompanionMode;
  readonly overlay: CompanionOverlay | null;
  readonly overlaySeq: number;
  /** Decorative motion allowed AND the window is visible (idle-0% rule). */
  readonly motion: boolean;
  /** False only when the master toggle is off — surfaces unmount entirely. */
  readonly enabled: boolean;
}

/**
 * The surface-facing read of the companion machine. Mounting any consumer
 * lazily starts the driver (idempotent), so whichever perch renders first
 * brings the resident to life.
 */
export function useCompanionPresence(): ICompanionPresence {
  useEffect(() => {
    ensureCompanionDriver();
  }, []);

  const machine = useCompanionRuntimeStore(s => s.machine);
  const suspended = useCompanionRuntimeStore(s => s.suspended);
  const species = useCompanionStore(s => s.species);
  const decorativeMotion = useDecorativeMotion();

  return {
    species,
    stage: machine.stage,
    mode: machine.mode,
    overlay: machine.overlay,
    overlaySeq: machine.overlaySeq,
    motion: decorativeMotion && !suspended,
    enabled: machine.mode !== 'hidden',
  };
}

/** The Settings-facing read of the durable self (ledger or local fallback). */
export interface ICompanionLedgerView {
  /** User-chosen name; null until named or without a backend. */
  readonly name: string | null;
  /** Whole listening hours behind the stage; null = unknown (no ledger yet). */
  readonly xpHours: number | null;
  /** True when the Rust ledger surface answered. */
  readonly hasBackend: boolean;
  readonly stage: CompanionStage;
  readonly species: CompanionSpecies;
  /** Persists locally always; mirrored to the ledger when it exists. */
  readonly setSpecies: (species: CompanionSpecies) => void;
}

export function useCompanionLedger(): ICompanionLedgerView {
  useEffect(() => {
    ensureCompanionDriver();
  }, []);

  const ledger = useCompanionRuntimeStore(s => s.ledger);
  const stage = useCompanionRuntimeStore(s => s.machine.stage);
  const species = useCompanionStore(s => s.species);
  const setLocalSpecies = useCompanionStore(s => s.setSpecies);

  const setSpecies = useCallback(
    (next: CompanionSpecies) => {
      setLocalSpecies(next);
      // Mirror into the ledger when present — fire-and-forget; the local
      // store already holds the truth this renderer paints with.
      void getCompanionApi()
        ?.setSpecies(next)
        .catch(() => {});
    },
    [setLocalSpecies]
  );

  return {
    name: ledger.name,
    xpHours: ledger.xpHours,
    hasBackend: ledger.hasBackend,
    stage,
    species,
    setSpecies,
  };
}
