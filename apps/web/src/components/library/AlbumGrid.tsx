import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { type Track } from '@/stores/types';
import { Disc3, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { groupTracksByAlbum, type AlbumData } from '@/lib/albumSort';

export type { AlbumData };

interface AlbumGridProps {
  library: Track[];
  searchQuery: string;
}

export function AlbumGrid({ library, searchQuery }: AlbumGridProps) {
  const { t } = useTranslation('library');
  const selectAlbum = useViewStore(s => s.selectAlbum);
  const albumGridScrollTop = useViewStore(s => s.albumGridScrollTop);
  const setAlbumGridScrollTop = useViewStore(s => s.setAlbumGridScrollTop);
  const albumGridSize = useUIStore(s => s.albumGridSize);
  const albumSortMode = useUIStore(s => s.albumSortMode);
  const albumSortOrder = useUIStore(s => s.albumSortOrder);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Capture scroll position at mount time — used to skip animation and restore scroll
  const savedScrollTop = useRef(albumGridScrollTop);
  const isReturning = useRef(albumGridScrollTop > 0);

  // Restore scroll position on remount
  useEffect(() => {
    if (scrollRef.current && savedScrollTop.current > 0) {
      scrollRef.current.scrollTop = savedScrollTop.current;
    }
  }, []);

  const handleAlbumClick = useCallback(
    (albumName: string) => {
      if (scrollRef.current) {
        setAlbumGridScrollTop(scrollRef.current.scrollTop);
      }
      selectAlbum(albumName);
    },
    [selectAlbum, setAlbumGridScrollTop]
  );

  const albums = useMemo(
    () => groupTracksByAlbum(library, albumSortMode, albumSortOrder),
    [library, albumSortMode, albumSortOrder]
  );

  const filteredAlbums = useMemo(() => {
    if (!searchQuery.trim()) return albums;
    const q = searchQuery.toLowerCase();
    return albums.filter(
      a => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
    );
  }, [albums, searchQuery]);

  const gridClassName = useMemo(() => {
    switch (albumGridSize) {
      case 'small':
        return 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2';
      case 'large':
        return 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4';
      case 'medium':
      default:
        return 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3';
    }
  }, [albumGridSize]);

  // Slightly smaller padding for the small grid so more info fits on screen.
  const cardPaddingClass = albumGridSize === 'small' ? 'p-3' : 'p-4';

  if (filteredAlbums.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <Search className="w-12 h-12 text-muted-foreground/20" strokeWidth={1.5} />
        <div>
          <p className="font-display text-base font-medium text-muted-foreground">
            {t('noMatchesTitle')}
          </p>
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
        className={gridClassName}
        initial={isReturning.current ? 'visible' : 'hidden'}
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: isReturning.current ? 0 : 0.04 } },
        }}
      >
        {filteredAlbums.map(album => (
          <motion.button
            key={album.name}
            variants={{
              hidden: { opacity: 0, y: 12 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: isReturning.current ? 0 : 0.3, ease: 'easeOut' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleAlbumClick(album.name)}
            className={`text-left ${cardPaddingClass} rounded-2xl bg-surface/60 border border-border/30 hover:border-border/60 hover:bg-surface transition-all duration-200 group`}
          >
            <div className="w-full aspect-square rounded-xl bg-muted/30 flex items-center justify-center mb-3 overflow-hidden">
              {album.albumArt ? (
                <img
                  src={album.albumArt}
                  alt={album.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <Disc3 className="w-10 h-10 text-muted-foreground/20 group-hover:text-muted-foreground/30 transition-colors" />
              )}
            </div>
            <p className="font-display text-sm font-semibold text-foreground truncate">
              {album.name}
            </p>
            <p className="text-xs text-muted-foreground/50 truncate mt-0.5">{album.artist}</p>
            <p className="text-[10px] text-muted-foreground/30 mt-1.5">
              {t('trackCount', { count: album.trackCount })}
            </p>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
