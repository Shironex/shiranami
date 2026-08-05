// Wire types for the desk companion's ledger (v2 companion, Phase 1).
// v2-only: v1 had no companion, so none of this had a channel to port.
//
// The Rust side of these shapes is `shiranami-core::companion`; the generated
// bindings carry the same fields. XP is honest listened seconds — the
// renderer's session clock, delivered through `db:history:record-play`, which
// is also where the accrual happens (the accrual point is the anti-gaming
// mechanism).

/** Which companion lives with the listener — a preference, not a collection. */
export type CompanionSpecies = 'shio' | 'hotaru';

/** The `companion_state` singleton, as `companion:get-state` returns it. */
export interface CompanionState {
  /** User-chosen name; `null` until the naming ceremony. */
  name: string | null;
  species: CompanionSpecies;
  /** Evolution stage reached — monotonic; the store ratchets, never decays. */
  stage: number;
  /** Lifetime XP in honest listened seconds. */
  xp: number;
  /** Unlocked accessory ids (Phase 3's surface; empty until then). */
  accessories: string[];
  /** ISO-8601 instant of the hatch; `null` only before the first read. */
  hatchedAt: string | null;
  /**
   * ISO-8601 instant of the *previous* sighting — `get-state` returns the old
   * value and then stamps the new one, so return-after-absence is one read.
   */
  lastSeenAt: string | null;
}

/** Payload of the `companion:xp` event, streamed after each recorded play. */
export interface CompanionXpGain {
  /** Seconds of honest listening this accrual added. */
  xpGained: number;
  /** Lifetime XP after the accrual, in seconds. */
  totalXp: number;
  /** The (possibly freshly ratcheted) stage after the accrual. */
  stage: number;
  /** True when this accrual crossed a stage threshold. */
  leveledUp: boolean;
}
