import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { ArtTile } from '@/components/art/ArtTile';
import { Text } from '@/components/ui/text';

interface AlbumCardProps {
  title: string;
  meta: string;
  artUri?: string;
  size: number;
  onPress: () => void;
}

/** A cover with its title and a muted line under it, for album grids and shelves. */
export const AlbumCard = memo(function AlbumCard({
  title,
  meta,
  artUri,
  size,
  onPress,
}: AlbumCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}`}
      onPress={onPress}
      className="active:opacity-80"
      style={{ width: size }}
    >
      <ArtTile title={title} artUri={artUri} size={size} radius={16} />
      <View className="mt-2">
        <Text variant="rowTitle" numberOfLines={1} className="text-[14.5px]">
          {title}
        </Text>
        <Text variant="meta" numberOfLines={1} className="mt-0.5 text-[13px]">
          {meta}
        </Text>
      </View>
    </Pressable>
  );
});
