import { Radio, Heart, Play } from 'lucide-react';
import { motion } from 'motion/react';
import type { RowComponentProps } from 'react-window';
import { cn } from '@/lib/utils';
import { EqBars } from '@/components/shared/EqBars';
import { useStationRow } from './StationRow.hooks';
import type { IStationRowProps } from './StationRow.types';

export default function StationRow(props: RowComponentProps<IStationRowProps>) {
  const {
    station,
    style,
    isActive,
    isFav,
    isPlaying,
    tagsStr,
    countryFlag,
    codecLabel,
    favoriteAriaLabel,
    nowPlayingLabel,
    onPlayClick,
    onFavoriteClick,
    onFaviconError,
  } = useStationRow(props);

  if (!station) return null;

  return (
    <div style={style} className="px-0.5">
      <div
        className={cn(
          'w-full flex items-center gap-3 px-3 h-[52px] rounded-xl text-left transition-all duration-200 group',
          isActive
            ? 'bg-primary/[0.08] text-foreground'
            : 'hover:bg-accent text-foreground/80 hover:text-foreground'
        )}
      >
        {/* Station info + play */}
        <button onClick={onPlayClick} className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden',
              isActive ? 'bg-primary/15' : 'bg-surface'
            )}
          >
            {station.favicon ? (
              <img
                src={station.favicon}
                alt={station.name}
                className="w-full h-full object-cover rounded-lg"
                loading="lazy"
                onError={onFaviconError}
              />
            ) : null}
            <Radio
              className={cn(
                'w-3.5 h-3.5 text-muted-foreground/40',
                station.favicon ? 'hidden' : ''
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-medium truncate text-left', isActive && 'text-primary')}>
              {station.name}
            </p>
            {tagsStr && (
              <p className="text-xs text-muted-foreground/50 truncate text-left">{tagsStr}</p>
            )}
          </div>
        </button>

        {/* Country + codec info */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {countryFlag && (
            <span className="text-xs" title={station.country}>
              {countryFlag}
            </span>
          )}
          {codecLabel && (
            <span className="text-[10px] text-muted-foreground/40 tabular-nums font-medium px-1.5 py-0.5 rounded bg-muted/50">
              {codecLabel}
            </span>
          )}
        </div>

        {/* Favorite button */}
        <motion.button
          whileTap={{ scale: 0.75 }}
          onClick={onFavoriteClick}
          className={cn(
            'shrink-0 p-1 rounded-md transition-colors duration-150',
            isFav
              ? 'text-favorite hover:text-favorite-hover'
              : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-muted-foreground/60'
          )}
          aria-label={favoriteAriaLabel}
        >
          <Heart
            className={cn('w-3.5 h-3.5 transition-all duration-150', isFav && 'fill-current')}
          />
        </motion.button>

        {/* Play/Pause indicator */}
        <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center">
          {isActive && isPlaying ? (
            <>
              <EqBars />
              <span className="sr-only">{nowPlayingLabel}</span>
            </>
          ) : (
            <Play className="w-3.5 h-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </div>
    </div>
  );
}
