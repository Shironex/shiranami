import type { CompanionStage } from '@/lib/companionMachine';

/**
 * Keepsake accessories — the pure vocabulary behind the companion's wardrobe.
 *
 * Unlike the weather fits (`companionOutfit.ts`), which the sky outside picks
 * and takes back, keepsakes are the listener's: each one unlocks at an
 * evolution stage and stays chosen until unchosen, persisted in the ledger's
 * `accessories` column. The ledger stores raw ids and nothing else — which
 * ids exist and which stages unlock them lives here, renderer-side, so a
 * rollback can never brick the pet over a hat.
 */

/** A keepsake the resident can wear; keys the `data-accessories` CSS reveal. */
export type CompanionAccessory = 'beret' | 'glasses' | 'satchel' | 'pendant';

export interface ICompanionAccessoryMeta {
  readonly id: CompanionAccessory;
  /** The evolution stage that unlocks this keepsake. */
  readonly unlockStage: CompanionStage;
}

/**
 * The catalog, one keepsake per growth stage past hatch — a small memento of
 * each evolution the listener witnessed. Order is render order.
 */
export const COMPANION_ACCESSORIES: readonly ICompanionAccessoryMeta[] = [
  { id: 'beret', unlockStage: 1 },
  { id: 'glasses', unlockStage: 2 },
  { id: 'satchel', unlockStage: 3 },
  { id: 'pendant', unlockStage: 4 },
];

export function isCompanionAccessory(value: unknown): value is CompanionAccessory {
  return COMPANION_ACCESSORIES.some(meta => meta.id === value);
}

/** Whether the given stage has grown into this keepsake yet. */
export function isAccessoryUnlocked(id: CompanionAccessory, stage: number): boolean {
  const meta = COMPANION_ACCESSORIES.find(m => m.id === id);
  return meta !== undefined && stage >= meta.unlockStage;
}

/**
 * The worn set as the rigs render it: known ids only, unlocked at this stage,
 * deduped, in catalog order — stable whatever order (or garbage) the ledger
 * stored. A keepsake from a stage the pet has not reached (a hand-edited row,
 * a rolled-back stage sync) simply waits in the drawer rather than erroring.
 */
export function sanitizeWornAccessories(
  worn: readonly string[],
  stage: number
): CompanionAccessory[] {
  const chosen = new Set(worn);
  return COMPANION_ACCESSORIES.filter(meta => chosen.has(meta.id) && stage >= meta.unlockStage).map(
    meta => meta.id
  );
}
