import { Disc3 } from 'lucide-react';
import { motion } from 'motion/react';
import { type CellComponentProps } from 'react-window';
import { TrackThumbnail } from '@/components/shared/TrackThumbnail';
import { SCALE_CARD } from '@/lib/motion';
import { ROW_HEIGHT_TEXT_BLOCK } from '../AlbumGrid.hooks';
import { useAlbumCell } from './AlbumCell.hooks';
import type { IAlbumCellProps } from './AlbumCell.types';

export default function AlbumCell(props: CellComponentProps<IAlbumCellProps>) {
  const { album, insetStyle, cardPaddingClass, imgPx, trackCountLabel, onSelect } =
    useAlbumCell(props);

  if (!album) {
    return <div style={insetStyle} aria-hidden="true" />;
  }

  return (
    <div style={insetStyle}>
      <motion.button
        whileTap={SCALE_CARD}
        onClick={onSelect}
        className={`text-left ${cardPaddingClass} rounded-2xl bg-card/70 border border-border/30 hover:border-primary/30 hover:shadow-[0_0_20px_-6px_rgba(var(--primary-rgb),0.4)] transition-all duration-200 group w-full h-full flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        <div
          className="w-full rounded-xl bg-muted/30 flex items-center justify-center mb-3 overflow-hidden"
          style={{ height: imgPx, flexShrink: 0 }}
        >
          <TrackThumbnail
            fill
            albumArt={album.albumArt}
            alt={album.name}
            fallback={
              <Disc3 className="w-10 h-10 text-muted-foreground/20 group-hover:text-muted-foreground/30 transition-colors" />
            }
          />
        </div>
        <div
          style={{ height: ROW_HEIGHT_TEXT_BLOCK }}
          className="flex flex-col justify-start min-w-0"
        >
          <p className="font-display text-sm font-semibold text-foreground truncate">
            {album.name}
          </p>
          <p className="text-xs text-muted-foreground/50 truncate mt-0.5">{album.artist}</p>
          <p className="text-xs text-muted-foreground/40 mt-1.5 truncate">{trackCountLabel}</p>
        </div>
      </motion.button>
    </div>
  );
}
