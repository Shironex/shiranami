import { Image, View } from 'react-native';
import { Scrim } from '@/components/art/Scrim';
import { ThemePhoto } from '@/components/art/ThemePhoto';
import { Text } from '@/components/ui/text';
import { pickKanji } from '@/lib/kanji';
import { pickPhotoCrop } from '@/lib/photos';
import { colors } from '@/lib/theme';
import { tileColors } from '@/lib/tiles';
import type { Track } from '@/stores/usePlayerStore';

const SCRIM = [
  { at: 0.55, color: colors.shade, opacity: 0 },
  { at: 1, color: colors.shade, opacity: 0.55 },
] as const;

function Seal({ title }: { title: string }) {
  const { glyph, hue } = pickKanji(title);
  const { bg, fg } = tileColors(hue);
  return (
    <View
      className="absolute bottom-4 left-4 h-[76px] w-[76px] items-center justify-center rounded-xl border border-border-strong"
      style={{
        backgroundColor: bg,
        boxShadow: '0 0 0 3px rgba(1,1,8,0.55), 0 12px 24px -8px rgba(0,0,4,0.8)',
      }}
    >
      <Text className="font-kanji" style={{ color: fg, fontSize: 40, lineHeight: 48 }}>
        {glyph}
      </Text>
    </View>
  );
}

/**
 * The player cover: the track's own art, or a framed theme photo with the
 * track's kanji as a seal in the corner.
 */
export function Cover({ track, size }: { track: Track; size: number }) {
  const frame = { width: size, height: size, borderRadius: 24 };
  const shadow = { boxShadow: '0 40px 60px -30px rgba(0,0,4,0.9)' };
  if (track.albumArt) {
    return (
      <View style={[frame, shadow]}>
        <Image source={{ uri: track.albumArt }} accessibilityIgnoresInvertColors style={frame} />
      </View>
    );
  }
  const crop = pickPhotoCrop(track.title);
  return (
    <View
      style={[frame, shadow]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <ThemePhoto
        photo={crop.photo}
        x={crop.x}
        y={Math.min(crop.y, 60)}
        zoom={1.25}
        size={{ width: size, height: size }}
        className="border border-border"
        style={{ borderRadius: 24 }}
      >
        <Scrim stops={SCRIM} />
      </ThemePhoto>
      <Seal title={track.title} />
    </View>
  );
}
