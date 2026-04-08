import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/stores/useAppStore';
import { type Track } from '@/stores/usePlayerStore';
import { Disc3, Search } from 'lucide-react';
import { motion } from 'motion/react';

export interface AlbumData {
  name: string;
  artist: string;
  albumArt?: string;
  trackCount: number;
  tracks: Track[];
}

function groupTracksByAlbum(tracks: Track[]): AlbumData[] {
  const map = new Map<string, AlbumData>();
  const artistSets = new Map<string, Set<string>>();

  for (const track of tracks) {
    const key = track.album || '';
    const existing = map.get(key);
    if (existing) {
      existing.trackCount++;
      existing.tracks.push(track);
      if (!existing.albumArt && track.albumArt) {
        existing.albumArt = track.albumArt;
      }
      const artists = artistSets.get(key)!;
      artists.add(track.artist);
      existing.artist = Array.from(artists).join(', ');
    } else {
      artistSets.set(key, new Set([track.artist]));
      map.set(key, {
        name: key || 'Unknown Album',
        artist: track.artist,
        albumArt: track.albumArt,
        trackCount: 1,
        tracks: [track],
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

interface AlbumGridProps {
  library: Track[];
  searchQuery: string;
}

export function AlbumGrid({ library, searchQuery }: AlbumGridProps) {
  const { t } = useTranslation('library');
  const selectAlbum = useAppStore(s => s.selectAlbum);
  const albumGridScrollTop = useAppStore(s => s.albumGridScrollTop);
  const setAlbumGridScrollTop = useAppStore(s => s.setAlbumGridScrollTop);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore scroll position on remount
  useEffect(() => {
    if (scrollRef.current && albumGridScrollTop > 0) {
      scrollRef.current.scrollTop = albumGridScrollTop;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAlbumClick = useCallback((albumName: string) => {
    if (scrollRef.current) {
      setAlbumGridScrollTop(scrollRef.current.scrollTop);
    }
    selectAlbum(albumName);
  }, [selectAlbum, setAlbumGridScrollTop]);

  const albums = useMemo(() => groupTracksByAlbum(library), [library]);

  const filteredAlbums = useMemo(() => {
    if (!searchQuery.trim()) return albums;
    const q = searchQuery.toLowerCase();
    return albums.filter(
      a =>
        a.name.toLowerCase().includes(q) ||
        a.artist.toLowerCase().includes(q)
    );
  }, [albums, searchQuery]);

  if (filteredAlbums.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <Search className="w-12 h-12 text-muted-foreground/20" strokeWidth={1.5} />
        <div>
          <p className="font-display text-base font-medium text-muted-foreground">{t('noMatchesTitle')}</p>
          <p className="text-sm text-muted-foreground/50 mt-1">{t('noMatchesSubtitle')}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-4">
      {searchQuery.trim() && (
        <p className="text-xs text-muted-foreground/50 mb-3 px-1">
          {t('albumFilterCount', { filtered: filteredAlbums.length, total: albums.length })}
        </p>
      )}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.04 } },
        }}
      >
        {filteredAlbums.map(album => (
          <motion.button
            key={album.name}
            variants={{
              hidden: { opacity: 0, y: 12 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleAlbumClick(album.name)}
            className="text-left p-4 rounded-2xl bg-surface/60 border border-border/30 hover:border-border/60 hover:bg-surface transition-all duration-200 group"
          >
            <div className="w-full aspect-square rounded-xl bg-muted/30 flex items-center justify-center mb-3 overflow-hidden">
              {album.albumArt ? (
                <img src={album.albumArt} alt={album.name} className="w-full h-full object-cover" />
              ) : (
                <Disc3 className="w-10 h-10 text-muted-foreground/20 group-hover:text-muted-foreground/30 transition-colors" />
              )}
            </div>
            <p className="font-display text-sm font-semibold text-foreground truncate">
              {album.name}
            </p>
            <p className="text-xs text-muted-foreground/50 truncate mt-0.5">
              {album.artist}
            </p>
            <p className="text-[10px] text-muted-foreground/30 mt-1.5">
              {t('trackCount', { count: album.trackCount })}
            </p>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
