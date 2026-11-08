import { useEffect, useRef } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical';
import Heart from 'lucide-react-native/icons/heart';
import { Cover } from '@/components/player/Cover';
import { PlayerActions } from '@/components/player/PlayerActions';
import { PlayerBackdrop } from '@/components/player/PlayerBackdrop';
import { SeekBar } from '@/components/player/SeekBar';
import { Transport } from '@/components/player/Transport';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useCurrentStation } from '@/hooks/useCurrentStation';
import { useToggleFavorite } from '@/hooks/useToggleFavorite';
import { stationMeta } from '@/lib/radio';
import { colors } from '@/lib/theme';
import { usePlayerStore } from '@/stores/usePlayerStore';

/** Cover side margin; the cover is the screen width minus both. */
const COVER_GUTTER = 24;
/** Keeps the whole player on screen on short phones. */
const MAX_COVER = 420;

export default function PlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const track = usePlayerStore(s => s.currentTrack);
  const source = usePlayerStore(s => s.queueSource);
  const toggleFavorite = useToggleFavorite();
  const radio = useCurrentStation();

  // Close once the queue is cleared under the open player (not on a cold open).
  const hadTrack = useRef(false);
  useEffect(() => {
    if (track) hadTrack.current = true;
    else if (hadTrack.current && router.canGoBack()) router.back();
  }, [track, router]);

  if (!track) return <View className="flex-1 bg-background" />;

  // Room under the cover for meta, seek, transport and actions (about 380pt).
  const coverSize = Math.min(width - COVER_GUTTER * 2, MAX_COVER, height - 380 - insets.top);
  const live = !!track.isLive;
  const favorite = live ? radio.saved : !!track.isFavorite;

  return (
    <View className="flex-1 bg-background">
      <PlayerBackdrop />
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 6,
          paddingBottom: Math.max(insets.bottom, 12) + 8,
        }}
      >
        <View className="flex-row items-center justify-between px-2">
          <IconButton
            icon={ChevronDown}
            size={24}
            color={colors.foreground}
            accessibilityLabel="Close player"
            onPress={() => router.back()}
          />
          <Text
            variant="label"
            numberOfLines={1}
            className="flex-1 text-center text-soft-foreground"
          >
            {live ? 'Live radio' : `Playing from ${source}`}
          </Text>
          {live ? (
            <View className="h-11 w-11" />
          ) : (
            <IconButton
              icon={EllipsisVertical}
              color={colors.foreground}
              accessibilityLabel="More for this song"
              onPress={() => router.push({ pathname: '/track/[id]', params: { id: track.id } })}
            />
          )}
        </View>

        <View className="items-center pt-5">
          <Cover track={track} size={coverSize} />
        </View>

        <View className="flex-row items-center gap-3 pl-7 pr-[18px] pt-6">
          <View className="min-w-0 flex-1">
            <Text variant="title" numberOfLines={1}>
              {track.title}
            </Text>
            <Text variant="bodyMuted" numberOfLines={1} className="mt-1 text-[16px]">
              {live && radio.station ? stationMeta(radio.station) : track.artist}
            </Text>
          </View>
          {(!live || radio.station) && (
            <IconButton
              icon={Heart}
              size={26}
              filled={favorite}
              color={favorite ? colors.favorite : colors.foreground}
              accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
              accessibilityState={{ selected: favorite }}
              onPress={() => (live ? radio.toggle() : toggleFavorite(track.id))}
            />
          )}
        </View>

        <View className="px-7 pt-[18px]">
          <SeekBar />
        </View>
        <View className="px-[22px] pt-3.5">
          <Transport />
        </View>
        <View className="mt-auto px-4 pt-6">
          <PlayerActions />
        </View>
      </ScrollView>
    </View>
  );
}
