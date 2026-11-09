import { useSharedValue } from 'react-native-reanimated';
import type { StageEnter } from '@/components/player/PlayerStage';
import type { Rect } from '@/lib/player-stage';

/** The player's open transition. For now the player is simply in place. */
export function usePlayerEnter(): StageEnter {
  const progress = useSharedValue(1);
  const origin = useSharedValue<Rect | null>(null);
  const offset = useSharedValue({ x: 0, y: 0 });
  return { progress, origin, offset };
}
