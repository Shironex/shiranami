import { useTranslation } from 'react-i18next';
import { Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { cn } from '@/lib/utils';

interface NowPlayingHeroProps {
  /** Only render when this returns true for the current track. Defaults to always showing. */
  show?: (track: Track) => boolean;
}

export function NowPlayingHero({ show }: NowPlayingHeroProps) {
  const { t } = useTranslation('common');
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const ambientColor = useAmbientColor();
  const nowPlayingViewEnabled = useAppStore((s) => s.nowPlayingViewEnabled);
  const enterNowPlaying = useAppStore((s) => s.enterNowPlaying);

  const visible = currentTrack && (!show || show(currentTrack));

  return (
    <AnimatePresence>
      {visible && currentTrack && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="px-6 pb-4 shrink-0 overflow-hidden"
        >
          <div
            className="relative rounded-2xl overflow-hidden p-5 flex items-center gap-5"
            style={{
              background: `linear-gradient(135deg, rgba(${ambientColor.rgb}, 0.15) 0%, rgba(${ambientColor.rgb}, 0.05) 100%)`,
            }}
          >
            {currentTrack.albumArt && (
              <div
                className="absolute inset-0 opacity-[0.08] blur-2xl scale-110"
                style={{ backgroundImage: `url(${currentTrack.albumArt})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={currentTrack.id}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 250 }}
                onDoubleClick={nowPlayingViewEnabled ? enterNowPlaying : undefined}
                className={cn(
                  'w-24 h-24 rounded-xl overflow-hidden shadow-2xl shadow-black/30 shrink-0 bg-muted flex items-center justify-center',
                  nowPlayingViewEnabled && 'cursor-pointer transition-transform hover:scale-[1.02]'
                )}
              >
                {currentTrack.albumArt ? (
                  <img src={currentTrack.albumArt} alt={currentTrack.title} className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-8 h-8 text-muted-foreground/40" />
                )}
              </motion.div>
            </AnimatePresence>

            <div className="relative min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-1">{t('nowPlaying')}</p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTrack.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  <h2 className="font-display text-lg font-semibold text-foreground truncate">{currentTrack.title}</h2>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">{currentTrack.artist} — {currentTrack.album}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
