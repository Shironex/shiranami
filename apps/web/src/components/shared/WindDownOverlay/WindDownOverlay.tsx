import { cn } from '@/lib/utils';
import { useWindDownOverlay } from './WindDownOverlay.hooks';

/**
 * The wind-down ending's visible half: a full-screen black veil that ramps in
 * over the timer's final minutes (composing above the theme/ambient layers —
 * their own dim and glow keep doing their jobs underneath), holds through the
 * fade to silence, and carries the one closing line as the screen settles.
 *
 * Non-interactive by construction: `pointer-events-none` throughout, capped at
 * a readable dim, and any real interaction lifts it (see the hook). The veil
 * is `aria-hidden` decoration; only the closing line, while present, reaches
 * the a11y tree — as a polite status so a screen reader hears the goodbye
 * exactly once.
 */
export default function WindDownOverlay() {
  const { visible, dimOpacity, closingLine, closingLineShown, animate } = useWindDownOverlay();

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 bg-black',
          animate && 'transition-opacity duration-1000 ease-linear'
        )}
        style={{ opacity: dimOpacity }}
      />

      {closingLine && (
        <p
          role="status"
          className={cn(
            'absolute inset-x-0 top-[40%] mx-auto max-w-md px-8 text-center',
            'font-serif text-xl leading-relaxed text-foreground/90',
            animate && 'transition-opacity duration-1000 ease-out'
          )}
          style={{ opacity: closingLineShown ? 1 : 0 }}
        >
          {closingLine}
        </p>
      )}
    </div>
  );
}
