import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical';
import Heart from 'lucide-react-native/icons/heart';
import LibraryIcon from 'lucide-react-native/icons/library';
import RadioIcon from 'lucide-react-native/icons/radio';
import { RemovalToast } from '@/components/library/RemovalToast';
import { PlayerActions } from '@/components/player/PlayerActions';
import { PlayerCard } from '@/components/player/PlayerCard';
import { PlayerBackdrop } from '@/components/player/PlayerBackdrop';
import { PlayerStage, staggered } from '@/components/player/PlayerStage';
import { SeekBar } from '@/components/player/SeekBar';
import { Transport } from '@/components/player/Transport';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useCurrentStation } from '@/hooks/useCurrentStation';
import { useLyrics } from '@/hooks/useLyrics';
import { usePlayerEnter } from '@/hooks/usePlayerEnter';
import { usePlayerFold } from '@/hooks/usePlayerFold';
import { useToggleFavorite } from '@/hooks/useToggleFavorite';
import { hasAlbum, normalizeAlbumTitle } from '@/lib/albums';
import { stationMeta } from '@/lib/radio';
import { UNKNOWN_ARTIST } from '@/lib/track-meta';
import { colors } from '@/lib/theme';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

/** Where the queue came from, as a quiet chip in the top bar. */
function SourceChip({ live, source }: { live: boolean; source: string }) {
  const Icon = live ? RadioIcon : LibraryIcon;
  return (
    <View className="flex-1 items-center">
      <View className="h-8 max-w-full flex-row items-center gap-1.5 rounded-full bg-border px-3">
        <Icon size={16} color={colors.softForeground} />
        <Text
          variant="label"
          numberOfLines={1}
          className="shrink text-[13.5px] text-soft-foreground"
        >
          {live ? 'Live radio' : source}
        </Text>
      </View>
    </View>
  );
}

/** A name in the meta line that opens its page. */
function MetaLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text
      accessibilityRole="link"
      onPress={onPress}
      suppressHighlighting
      className="text-soft-foreground"
    >
      {label}
    </Text>
  );
}

/** "Artist · Album", each part a link to its page when the tags name one. */
function TrackMetaLine({ track, onOpen }: { track: Track; onOpen: (href: MetaHref) => void }) {
  const knownArtist = track.artist !== UNKNOWN_ARTIST;
  const parts: ReactNode[] = [
    knownArtist ? (
      <MetaLink
        key="artist"
        label={track.artist}
        onPress={() => onOpen({ pathname: '/artist/[name]', params: { name: track.artist } })}
      />
    ) : (
      track.artist
    ),
  ];
  if (hasAlbum(track)) {
    const album = normalizeAlbumTitle(track.album);
    parts.push(
      ' · ',
      <MetaLink
        key="album"
        label={album}
        onPress={() =>
          onOpen({
            pathname: '/album/[title]',
            params: { title: album, artist: track.artist },
          })
        }
      />
    );
  }
  return <>{parts}</>;
}

type MetaHref =
  | { pathname: '/artist/[name]'; params: { name: string } }
  | { pathname: '/album/[title]'; params: { title: string; artist: string } };

export default function PlayerScreen() {
  const router = useRouter();
  const track = usePlayerStore(s => s.currentTrack);

  // Close once the queue is cleared under the open player (not on a cold open).
  const hadTrack = useRef(false);
  useEffect(() => {
    if (track) hadTrack.current = true;
    else if (hadTrack.current && router.canGoBack()) router.back();
  }, [track, router]);

  if (!track) return <View className="flex-1 bg-background" />;
  return <PlayerView track={track} />;
}

function PlayerView({ track }: { track: Track }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const source = usePlayerStore(s => s.queueSource);
  const toggleFavorite = useToggleFavorite();
  const radio = useCurrentStation();
  const live = !!track.isLive;
  const { lyrics, loading: lyricsLoading } = useLyrics(
    live ? undefined : track.title,
    track.artist,
    track.album,
    track.duration
  );
  const hasLyrics = !!(lyrics.synced || lyrics.plain);
  const { folded, hero, fade, tab, onTab } = usePlayerFold(track.id, live, hasLyrics);
  const enter = usePlayerEnter();

  const stageStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const chromeStyle = useAnimatedStyle(() => {
    const shown = staggered(enter.progress.value, 0.2);
    return { opacity: shown, transform: [{ translateY: (1 - shown) * 12 }] };
  });

  const favorite = live ? radio.saved : !!track.isFavorite;
  const open = (href: MetaHref) => {
    router.back();
    router.navigate(href);
  };

  const meta = (
    <Text variant="bodyMuted" numberOfLines={1} className="mt-1 text-[15px]">
      {live && radio.station ? (
        stationMeta(radio.station)
      ) : (
        <TrackMetaLine track={track} onOpen={open} />
      )}
    </Text>
  );
  const heart =
    !live || radio.station ? (
      <IconButton
        icon={Heart}
        size={26}
        filled={favorite}
        color={favorite ? colors.favorite : colors.foreground}
        accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
        accessibilityState={{ selected: favorite }}
        onPress={() => (live ? radio.toggle() : toggleFavorite(track.id))}
      />
    ) : null;

  return (
    <View className="flex-1 bg-background">
      <PlayerBackdrop />
      <View
        className="flex-1"
        style={{ paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 12) + 8 }}
      >
        <View className="flex-row items-center justify-between gap-2 px-2">
          <IconButton
            icon={ChevronDown}
            size={24}
            color={colors.foreground}
            accessibilityLabel="Close player"
            onPress={() => router.back()}
          />
          <SourceChip live={live} source={source} />
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

        <Animated.View style={[{ flex: 1 }, stageStyle]}>
          <PlayerStage
            track={track}
            hasCard={!live}
            hero={hero}
            enter={enter}
            coverLabel={live ? undefined : 'Lyrics full screen'}
            onCoverPress={live || !hasLyrics ? undefined : () => router.push('/lyrics')}
            sideTitle={
              <>
                <Text variant="heading" numberOfLines={2}>
                  {track.title}
                </Text>
                {meta}
              </>
            }
            heroTitle={
              <>
                <Text variant="title" numberOfLines={1}>
                  {track.title}
                </Text>
                {meta}
              </>
            }
            heart={heart}
            renderCard={bodyHeight => (
              <PlayerCard
                track={track}
                lyrics={lyrics}
                loading={lyricsLoading}
                tab={tab}
                onTab={onTab}
                folded={folded}
                fold={hero}
                bodyHeight={bodyHeight}
              />
            )}
          />
        </Animated.View>

        <Animated.View style={chromeStyle}>
          <View className="px-4 pt-3">
            <PlayerActions track={track} />
          </View>
          <View className="px-7 pt-2">
            <SeekBar />
          </View>
          <View className="px-[22px] pt-3.5">
            <Transport />
          </View>
        </Animated.View>
      </View>
      <RemovalToast bottom={Math.max(insets.bottom, 12) + 96} />
    </View>
  );
}
