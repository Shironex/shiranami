import { motion } from 'motion/react';
import { Heart } from 'lucide-react';
import { SCALE_ICON } from '@/lib/motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MotionIconButton } from '@/components/ui/icon-button';
import { FavoriteBurst } from '../../FavoriteBurst';
import { useCompactFavoriteButton } from './CompactFavoriteButton.hooks';

/**
 * Compact-mode favorite button. Lives in the title bar so the user can heart
 * the current track without expanding the window. Hidden for radio tracks and
 * when nothing is playing. Shuffle/repeat are intentionally NOT here — they
 * already live in the main PlayerControls row below to avoid duplication.
 */
export default function CompactFavoriteButton() {
  const {
    visible,
    heartControls,
    favoriteBurst,
    showFavoriteBurst,
    buttonLabel,
    tooltipLabel,
    buttonClassName,
    heartClassName,
    onToggleFavorite,
  } = useCompactFavoriteButton();

  if (!visible) return null;

  return (
    <div className="flex items-center rounded-xl border border-border/20 bg-background/35 p-0.5 shadow-sm shadow-black/10">
      <Tooltip>
        <TooltipTrigger asChild>
          <MotionIconButton
            whileTap={SCALE_ICON}
            onClick={onToggleFavorite}
            className={buttonClassName}
            aria-label={buttonLabel}
          >
            {showFavoriteBurst && <FavoriteBurst burstKey={favoriteBurst} />}
            <motion.span animate={heartControls} className="inline-flex">
              <Heart className={heartClassName} />
            </motion.span>
          </MotionIconButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}
