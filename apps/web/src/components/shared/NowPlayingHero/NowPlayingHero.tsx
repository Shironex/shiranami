import { Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { cn } from '@/lib/utils';
import { useNowPlayingHero } from './NowPlayingHero.hooks';
import type { INowPlayingHeroProps } from './NowPlayingHero.types';

export default function NowPlayingHero(props: INowPlayingHeroProps) {
  const { t, track, heroStyle, showBlurBackdrop, nowPlayingViewEnabled, onEnterNowPlaying } =
    useNowPlayingHero(props);

  return (
    <AnimatePresence>
      {track && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="px-6 pb-4 shrink-0 overflow-hidden"
        >
          <div
            className="now-playing-hero relative rounded-2xl overflow-hidden p-5 flex items-center gap-5"
            style={heroStyle}
          >
            {/* Frosted base — invisible on the solid default background, but a
                legible glass surface under image themes so the hero text never
                sits on a bare bright photo (e.g. summer). Gated on [data-theme]
                in globals.css so the default 'none' theme keeps its airy look. */}
            <div
              aria-hidden="true"
              className="now-playing-hero-surface absolute inset-0 pointer-events-none"
            />

            {showBlurBackdrop && (
              // Render the blurred backdrop as a positioned <img> rather than
              // background-image: this lets Chromium share the decoded bitmap
              // with the foreground <img> below (CSS background-image lives in
              // a separate cache, doubling decoded RAM per render).
              <img
                src={track.albumArt}
                alt=""
                aria-hidden="true"
                loading="eager"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover opacity-[0.08] pointer-events-none"
                style={{ filter: 'blur(32px)', transform: 'scale(1.1)' }}
              />
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={track.id}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 250 }}
                onDoubleClick={nowPlayingViewEnabled ? onEnterNowPlaying : undefined}
                className={cn(
                  // `relative` is load-bearing, not cosmetic: the two overlays
                  // above are absolutely positioned, so they paint above any
                  // in-flow sibling. Motion only lifts this wrapper out of the
                  // in-flow paint phase while the entrance spring is running
                  // (a live transform creates a stacking context); once it
                  // settles at scale 1 motion writes `transform: none` and the
                  // artwork would drop behind the frosted surface — picking up
                  // its 70% dark fill and blur(10px) backdrop-filter under
                  // image themes. Positioning it keeps it on top for good.
                  'relative w-24 h-24 rounded-xl overflow-hidden shadow-2xl shadow-black/30 shrink-0 bg-muted flex items-center justify-center',
                  nowPlayingViewEnabled && 'cursor-pointer transition-transform hover:scale-[1.02]'
                )}
              >
                <TrackThumbnail
                  fill
                  albumArt={track.albumArt}
                  alt={track.title}
                  fallback={<Music className="w-8 h-8 text-muted-foreground/40" />}
                />
              </motion.div>
            </AnimatePresence>

            <div className="relative min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-1">
                {t('nowPlaying')}
              </p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={track.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  <h2 className="font-serif italic text-2xl text-foreground truncate">
                    {track.title}
                  </h2>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {track.artist} · {track.album}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
