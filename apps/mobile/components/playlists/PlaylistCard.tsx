import { memo, type ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';
import Heart from 'lucide-react-native/icons/heart';
import Plus from 'lucide-react-native/icons/plus';
import { ArtTile } from '@/components/art/ArtTile';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import { tileColors } from '@/lib/tiles';
import { cn } from '@/lib/utils';

const RADIUS = 18;
const MOSAIC_GAP = 2;

interface CardProps {
  title: string;
  meta?: string;
  size: number;
  label: string;
  onPress: () => void;
  quiet?: boolean;
  children: ReactNode;
}

/** A square tile with a title and a muted line under it, for the playlist grid. */
function Card({ title, meta, size, label, onPress, quiet, children }: CardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="active:opacity-80"
      style={{ width: size }}
    >
      <View style={{ width: size, height: size }}>{children}</View>
      <Text
        variant="rowTitle"
        numberOfLines={1}
        className={cn('mt-[9px] text-[15px]', quiet && 'text-soft-foreground')}
      >
        {title}
      </Text>
      <Text variant="meta" numberOfLines={1} className="mt-0.5 text-[13px]">
        {meta ?? ' '}
      </Text>
    </Pressable>
  );
}

/** Four covers in a 2 by 2 grid, or one cover, or the kanji tile. */
function PlaylistArt({ name, covers, size }: { name: string; covers: string[]; size: number }) {
  if (covers.length === 0) return <ArtTile title={name} size={size} radius={RADIUS} />;
  if (covers.length === 1) {
    return <ArtTile title={name} artUri={covers[0]} size={size} radius={RADIUS} />;
  }
  const cell = (size - MOSAIC_GAP) / 2;
  return (
    <View
      className="flex-row flex-wrap overflow-hidden bg-card"
      style={{ width: size, height: size, borderRadius: RADIUS, gap: MOSAIC_GAP }}
    >
      {covers.map(uri => (
        <Image key={uri} source={{ uri }} style={{ width: cell, height: cell }} />
      ))}
      {/* The hairline sits over the covers so it does not shrink the grid. */}
      <View
        pointerEvents="none"
        className="absolute inset-0 border border-border"
        style={{ borderRadius: RADIUS }}
      />
    </View>
  );
}

export const PlaylistCard = memo(function PlaylistCard({
  name,
  meta,
  covers,
  size,
  onPress,
}: {
  name: string;
  meta: string;
  covers: string[];
  size: number;
  onPress: () => void;
}) {
  return (
    <Card title={name} meta={meta} size={size} label={`${name}, ${meta}`} onPress={onPress}>
      <PlaylistArt name={name} covers={covers} size={size} />
    </Card>
  );
});

/** Favorites as a playlist that fills itself. */
export const FavoritesCard = memo(function FavoritesCard({
  meta,
  size,
  onPress,
}: {
  meta: string;
  size: number;
  onPress: () => void;
}) {
  const { bg, fg } = tileColors('15');
  return (
    <Card title="Favorites" meta={meta} size={size} label={`Favorites, ${meta}`} onPress={onPress}>
      <View
        className="flex-1 items-center justify-center border border-border"
        style={{ borderRadius: RADIUS, backgroundColor: bg }}
      >
        <Heart size={40} strokeWidth={1.6} color={fg} />
      </View>
    </Card>
  );
});

/** The last tile: an outlined square with a plus. */
export const NewPlaylistCard = memo(function NewPlaylistCard({
  size,
  onPress,
}: {
  size: number;
  onPress: () => void;
}) {
  return (
    <Card title="New playlist" size={size} label="New playlist" onPress={onPress} quiet>
      <View
        className="flex-1 items-center justify-center border-[1.5px] border-border-strong"
        style={{ borderRadius: RADIUS }}
      >
        <Plus size={32} color={colors.softForeground} />
      </View>
    </Card>
  );
});
