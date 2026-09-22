import { useEffect } from 'react';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useRecapStore } from '@/stores/useRecapStore';
import { useWeeklyRecapQuery, type WeeklyRecap } from '@/hooks/queries/useRecap';
import { RECAP_MIN_PLAYS, getLastCompletedWeek, isRecapFresh } from '@/lib/recap';

export interface WeeklyRecapState {
  /** The latest completed week's recap, when it earned a card. */
  recap: WeeklyRecap | null;
  /** Whether Overview should show the card right now. */
  visible: boolean;
}

/**
 * Overview's recap eligibility: the card appears on its own once the latest
 * week completes and has enough plays to be worth narrating, then lingers for
 * a few days *from when this user first saw it* (opening the app on Thursday
 * still gets Monday's card) before folding away into the History archive.
 *
 * Degrades honestly: a week under the play floor produces no card at all —
 * never a card of zeros. The `overviewRecap` interface toggle is the opt-out,
 * like every other Overview widget.
 */
export function useWeeklyRecap(): WeeklyRecapState {
  const enabled = useInterfaceStore(s => s.overviewRecap);
  const shownWeekKey = useRecapStore(s => s.shownWeekKey);
  const firstShownAt = useRecapStore(s => s.firstShownAt);
  const noteShown = useRecapStore(s => s.noteShown);

  const week = getLastCompletedWeek();
  const { data } = useWeeklyRecapQuery(enabled ? week : null);

  const earned = data !== undefined && data.totalPlays >= RECAP_MIN_PLAYS;
  const stamped = shownWeekKey === week.key && firstShownAt !== null;

  // First render with an earned card for a week not yet revealed: stamp the
  // reveal so the linger window anchors to this user's actual return.
  useEffect(() => {
    if (enabled && earned && !stamped) {
      noteShown(week.key);
    }
  }, [enabled, earned, stamped, week.key, noteShown]);

  // An unstamped card is being stamped this very tick — fresh by definition,
  // so it doesn't flicker in a render late. (Narrow on the timestamp itself so
  // TypeScript follows; `stamped` is the same condition.)
  const fresh =
    shownWeekKey === week.key && firstShownAt !== null
      ? isRecapFresh(firstShownAt, Date.now())
      : true;

  return {
    recap: earned ? data : null,
    visible: enabled && earned && fresh,
  };
}
