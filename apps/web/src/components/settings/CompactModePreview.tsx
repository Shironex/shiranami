import { useTranslation } from 'react-i18next';
import { Music2, Heart, Play, SkipBack, SkipForward } from 'lucide-react';
import {
  useAppStore,
  CMP_TITLE_CLASS,
  CMP_ARTIST_CLASS,
  CMP_ALBUM_CLASS,
  type CompactSize,
} from '@/stores/useAppStore';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { cn } from '@/lib/utils';

const SIZE_WIDTH: Record<CompactSize, number> = {
  sm: 210,
  md: 250,
  lg: 300,
};

export function CompactModePreview() {
  const { t } = useTranslation('settings');

  const compactSize = useAppStore(s => s.compactSize);
  const compactFontSize = useAppStore(s => s.compactFontSize);
  const compactShowAlbumArt = useAppStore(s => s.compactShowAlbumArt);
  const compactShowAlbum = useAppStore(s => s.compactShowAlbum);
  const compactShowSeek = useAppStore(s => s.compactShowSeek);
  const compactShowVolume = useAppStore(s => s.compactShowVolume);
  const compactShowFavorite = useAppStore(s => s.compactShowFavorite);

  const cardWidth = SIZE_WIDTH[compactSize];
  const titleClass = CMP_TITLE_CLASS[compactFontSize];
  const artistClass = CMP_ARTIST_CLASS[compactFontSize];
  const albumClass = CMP_ALBUM_CLASS[compactFontSize];

  const artSize = compactSize === 'sm' ? 36 : compactSize === 'lg' ? 52 : 44;
  const padding = compactSize === 'sm' ? 'p-2' : compactSize === 'lg' ? 'p-3.5' : 'p-3';
  const controlSize = compactSize === 'sm' ? 10 : compactSize === 'lg' ? 14 : 12;

  return (
    <SettingsPreview title={t('cmp.preview')}>
      <div className="bg-background/40 border border-border/30 rounded-xl p-4 flex flex-col items-center justify-center gap-0">
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
            {compactShowAlbumArt && (
              <div
                className="shrink-0 rounded-md bg-muted/50 border border-border/20 flex items-center justify-center text-muted-foreground/40"
                style={{ width: artSize, height: artSize }}
              >
                <Music2 size={artSize * 0.45} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className={cn('truncate text-foreground', titleClass)}>
                {t('cmp.previewTrackTitle')}
              </p>
              <p className={cn('truncate text-muted-foreground', artistClass)}>Sample Artist</p>
              {compactShowAlbum && (
                <p className={cn('truncate text-muted-foreground/60', albumClass)}>
                  {t('cmp.previewAlbum')}
                </p>
              )}
            </div>

            {compactShowFavorite && (
              <Heart size={controlSize} className="shrink-0 text-muted-foreground/50" />
            )}
          </div>

          {/* Seek bar */}
          {compactShowSeek && (
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

            {compactShowVolume && (
              <div className="flex items-center gap-1">
                <div className="w-10 h-0.5 rounded-full bg-muted/40 relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0 w-3/4 rounded-full bg-muted-foreground/30" />
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
          {t('cmp.previewDisclaimer')}
        </p>
      </div>
    </SettingsPreview>
  );
}

export default CompactModePreview;
