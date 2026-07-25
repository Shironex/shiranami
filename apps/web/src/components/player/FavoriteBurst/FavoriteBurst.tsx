import { motion } from 'motion/react';
import { useFavoriteBurst } from './FavoriteBurst.hooks';
import type { IFavoriteBurstProps } from './FavoriteBurst.types';

/**
 * Expanding ring that plays once when a track is freshly favorited. Shared by
 * the player bar and the compact favorite button. Render it inside the heart
 * button (which must be positioned `relative`); guard rendering with the
 * `showFavoriteBurst` flag from {@link useFavoriteCelebration}.
 */
export default function FavoriteBurst(props: IFavoriteBurstProps) {
  const { burstKey } = useFavoriteBurst(props);

  return (
    <motion.span
      key={burstKey}
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full bg-favorite/25"
      initial={{ scale: 0.5, opacity: 0.6 }}
      animate={{ scale: 1.9, opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    />
  );
}
