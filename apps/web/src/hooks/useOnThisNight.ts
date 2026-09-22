import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useOnThisNightQuery, type OnThisNightMemory } from '@/hooks/queries/useMemories';

export interface OnThisNightState {
  /** The anniversary memory, when one of the lookback windows has plays. */
  memory: OnThisNightMemory | null;
  /** Whether Overview should show the card right now. */
  visible: boolean;
}

/**
 * Overview's memories eligibility: the card appears only when an anniversary
 * window (a year ago tonight, else six months) actually holds plays — a
 * silent night produces no card at all, never a card of zeros. The
 * `overviewMemories` interface toggle is the opt-out, like every other
 * Overview widget.
 */
export function useOnThisNight(): OnThisNightState {
  const enabled = useInterfaceStore(s => s.overviewMemories);
  const { data } = useOnThisNightQuery(enabled);
  const memory = data ?? null;

  return {
    memory,
    visible: enabled && memory !== null,
  };
}
