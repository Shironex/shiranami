import { useCallback, useMemo } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { Music, Play, Pause, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { List } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';

export function FavoritesView() {
  const library = usePlayerStore(s => s.library);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const setQueue = usePlayerStore(s => s.setQueue);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const toggleFavorite = usePlayerStore(s => s.toggleFavorite);
  const ambientColor = useAmbientColor();

  const favorites = useMemo(
    () => library.filter((t) => t.isFavorite),
    [library]
  );

  const showHero = currentTrack?.isFavorite;

  const handlePlayTrack = useCallback(
    (favIndex: number) => {
      // When playing from favorites, set the queue to just the favorites list
      setQueue(favorites, favIndex);
    },
    [favorites, setQueue]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Now Playing Hero (only if current track is a favorite) */}
      <AnimatePresence>
        {showHero && currentTrack && (
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
                  className="w-24 h-24 rounded-xl overflow-hidden shadow-2xl shadow-black/30 shrink-0 bg-muted flex items-center justify-center"
                >
                  {currentTrack.albumArt ? (
                    <img src={currentTrack.albumArt} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music className="w-8 h-8 text-muted-foreground/40" />
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="relative min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-1">Now Playing</p>
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

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-primary/20 hover:bg-primary/30 flex items-center justify-center text-primary transition-colors shrink-0"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Favorites list */}
      {favorites.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <Heart className="w-16 h-16 text-muted-foreground/20" strokeWidth={1.5} />
          <div>
            <p className="font-display text-base font-medium text-muted-foreground">No favorites yet</p>
            <p className="text-sm text-muted-foreground/50 mt-1">Click the heart icon on any track to add it here</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-4">
          <List
            rowCount={favorites.length}
            rowHeight={52}
            overscanCount={10}
            className="scrollbar-thin"
            style={{ height: '100%' }}
            rowComponent={TrackRow}
            rowProps={{ queue: favorites, currentTrack, isPlaying, handlePlayTrack, onToggleFavorite: toggleFavorite, showAddToPlaylist: true }}
          />
        </div>
      )}
    </div>
  );
}
