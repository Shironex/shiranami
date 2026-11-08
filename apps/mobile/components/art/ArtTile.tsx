import { memo } from 'react';
import { Image, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useSettingsContext } from '@/context/SettingsContext';
import { pickKanji } from '@/lib/kanji';
import { pickPhotoCrop } from '@/lib/photos';
import { tileColors } from '@/lib/tiles';
import { ThemePhoto } from './ThemePhoto';

/** How far a photo tile zooms in, so it reads as a detail, not the whole room. */
const PHOTO_TILE_ZOOM = 2.9;

interface ArtTileProps {
  /** Picks the kanji or the photo crop; the same title always gets the same tile. */
  title: string;
  size?: number;
  radius?: number;
  /** Real artwork wins over any placeholder. */
  artUri?: string | null;
}

function KanjiTile({ title, size, radius }: { title: string; size: number; radius: number }) {
  const { glyph, hue } = pickKanji(title);
  const { bg, fg } = tileColors(hue);
  return (
    <View
      className="items-center justify-center border border-border"
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg }}
    >
      <Text
        className="font-kanji"
        style={{ color: fg, fontSize: Math.round(size / 2), lineHeight: Math.round(size * 0.62) }}
      >
        {glyph}
      </Text>
    </View>
  );
}

function PhotoTile({ title, size, radius }: { title: string; size: number; radius: number }) {
  const crop = pickPhotoCrop(title);
  return (
    <ThemePhoto
      photo={crop.photo}
      x={crop.x}
      y={crop.y}
      zoom={PHOTO_TILE_ZOOM}
      size={{ width: size, height: size }}
      className="border border-border-strong"
      style={{ borderRadius: radius }}
    />
  );
}

/**
 * Artwork for a track or station: its own art when it has one, otherwise the
 * placeholder the user picked in Settings (a kanji tile or a photo crop).
 * Decorative: the row beside it carries the title for screen readers.
 */
function ArtTileInner({ title, size = 48, radius = 10, artUri }: ArtTileProps) {
  const { settings } = useSettingsContext();

  if (artUri) {
    return (
      <Image
        source={{ uri: artUri }}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  return settings.placeholderArt === 'photo' ? (
    <PhotoTile title={title} size={size} radius={radius} />
  ) : (
    <KanjiTile title={title} size={size} radius={radius} />
  );
}

export const ArtTile = memo(ArtTileInner);
