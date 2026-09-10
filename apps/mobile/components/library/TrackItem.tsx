import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Heart, Music2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import type { Track } from '@/stores/usePlayerStore';

interface TrackItemProps {
  track: Track;
  isActive: boolean;
  onPress: () => void;
  onFavoritePress: () => void;
}

function TrackItemInner({ track, isActive, onPress, onFavoritePress }: TrackItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.container, pressed && s.pressed, isActive && s.active]}
    >
      <View style={s.artContainer}>
        {track.albumArt ? (
          <View style={s.art} />
        ) : (
          <View style={s.artPlaceholder}>
            <Music2 size={20} color={colors.mutedForeground} />
          </View>
        )}
      </View>
      <View style={s.info}>
        <Text style={[s.title, isActive && s.titleActive]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={s.artist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      <Pressable onPress={onFavoritePress} hitSlop={12} style={s.favoriteBtn}>
        <Heart
          size={18}
          color={track.isFavorite ? colors.favorite : colors.mutedForeground}
          fill={track.isFavorite ? colors.favorite : 'transparent'}
        />
      </Pressable>
    </Pressable>
  );
}

export const TrackItem = memo(TrackItemInner);

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  active: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  artContainer: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
  },
  art: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.muted,
    borderRadius: 8,
  },
  artPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.muted,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
  },
  titleActive: {
    color: colors.primary,
  },
  artist: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  favoriteBtn: {
    padding: 8,
  },
});
