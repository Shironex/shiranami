import { memo } from 'react';
import { useMediaSessionSync } from './MediaSessionSync.hooks';

/**
 * Isolated leaf that owns the currentTime-dependent media-session side-effects.
 * Rendering null keeps the re-render contained to this leaf instead of the root
 * App tree (mirrors the TimeDisplay pattern).
 */
function MediaSessionSync() {
  useMediaSessionSync();
  return null;
}

export default memo(MediaSessionSync);
