import { Music2, Heart, Mic2, Play, SkipBack, SkipForward } from 'lucide-react';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { cn } from '@/lib/utils';
import { useCompactModePreview } from './CompactModePreview.hooks';

export default function CompactModePreview() {
  const {
    title,
    disclaimer,
    trackTitle,
    artist,
    album,
    cardWidth,
    titleClass,
    artistClass,
    albumClass,
    artSize,
    artIconSize,
    padding,
    controlSize,
    showAlbumArt,
    showAlbum,
    showSeek,
    showVolume,
    showFavorite,
    showLyrics,
    showGlyphCluster,
  } = useCompactModePreview();

  return (
    <SettingsPreview title={title}>
      <div
        className="bg-background/40 border border-border/30 rounded-xl p-4 flex flex-col items-center justify-center gap-0"
        role="img"
        aria-label={title}
      >
        {/* Mock mini-player card */}
        <div
          className={cn(
            'bg-surface/70 border border-border/30 rounded-xl shadow-sm flex flex-col gap-1.5',
            padding
          )}
          style={{ width: cardWidth }}
        >
          {/* Top row: art + text + favorite */}
          <div className="flex items-center gap-2">
            {showAlbumArt && (
              <div
                className="shrink-0 rounded-md bg-muted/50 border border-border/20 flex items-center justify-center text-muted-foreground/40"
                style={{ width: artSize, height: artSize }}
              >
                <Music2 size={artIconSize} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className={cn('truncate text-foreground', titleClass)}>{trackTitle}</p>
              <p className={cn('truncate text-muted-foreground', artistClass)}>{artist}</p>
              {showAlbum && (
                <p className={cn('truncate text-muted-foreground/60', albumClass)}>{album}</p>
              )}
            </div>

            {showGlyphCluster && (
              <div className="flex shrink-0 items-center gap-1">
                {showFavorite && <Heart size={controlSize} className="text-muted-foreground/50" />}
                {showLyrics && <Mic2 size={controlSize} className="text-muted-foreground/50" />}
              </div>
            )}
          </div>

          {/* Seek bar */}
          {showSeek && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] tabular-nums text-muted-foreground/50 shrink-0">
                1:23
              </span>
              <div className="flex-1 h-0.5 rounded-full bg-muted/40 relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary/50" />
              </div>
              <span className="text-[8px] tabular-nums text-muted-foreground/50 shrink-0">
                3:47
              </span>
            </div>
          )}

          {/* Controls row: playback + optional volume */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SkipBack size={controlSize} className="text-muted-foreground/60" />
              <Play size={controlSize} className="text-foreground/70" />
              <SkipForward size={controlSize} className="text-muted-foreground/60" />
            </div>

            {showVolume && (
              <div className="flex items-center gap-1">
                <div className="w-10 h-0.5 rounded-full bg-muted/40 relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0 w-3/4 rounded-full bg-muted-foreground/30" />
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/60 text-center mt-2">{disclaimer}</p>
      </div>
    </SettingsPreview>
  );
}
