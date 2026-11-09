import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical';
import Heart from 'lucide-react-native/icons/heart';
import LibraryIcon from 'lucide-react-native/icons/library';
import RadioIcon from 'lucide-react-native/icons/radio';
import { ArtTile } from '@/components/art/ArtTile';
import { RemovalToast } from '@/components/library/RemovalToast';
import { Cover } from '@/components/player/Cover';
import { PlayerActions } from '@/components/player/PlayerActions';
import { PlayerCard } from '@/components/player/PlayerCard';
import { PlayerBackdrop } from '@/components/player/PlayerBackdrop';
import { SeekBar } from '@/components/player/SeekBar';
import { Transport } from '@/components/player/Transport';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useCurrentStation } from '@/hooks/useCurrentStation';
import { useLyrics } from '@/hooks/useLyrics';
import { useToggleFavorite } from '@/hooks/useToggleFavorite';
import { hasAlbum, normalizeAlbumTitle } from '@/lib/albums';
import { stationMeta } from '@/lib/radio';
import { UNKNOWN_ARTIST } from '@/lib/track-meta';
import { colors } from '@/lib/theme';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { usePlayerViewStore } from '@/stores/usePlayerViewStore';

/** Cover side margin; the cover is the screen width minus both. */
const COVER_GUTTER = 24;
/** Keeps the whole player on screen on short phones. */
const MAX_COVER = 420;
/** The cover beside the title when the lyrics and up next card is shown. */
const PEEK_COVER = 132;

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
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const track = usePlayerStore(s => s.currentTrack);
  const source = usePlayerStore(s => s.queueSource);
  const toggleFavorite = useToggleFavorite();
  const radio = useCurrentStation();
  const tab = usePlayerViewStore(s => s.tab);
  const setTab = usePlayerViewStore(s => s.setTab);
  const { lyrics, loading: lyricsLoading } = useLyrics(
    track?.isLive ? undefined : track?.title,
    track?.artist,
    track?.album,
    track?.duration
  );

  // Close once the queue is cleared under the open player (not on a cold open).
  const hadTrack = useRef(false);
  useEffect(() => {
    if (track) hadTrack.current = true;
    else if (hadTrack.current && router.canGoBack()) router.back();
  }, [track, router]);

  if (!track) return <View className="flex-1 bg-background" />;

  const live = !!track.isLive;
  const favorite = live ? radio.saved : !!track.isFavorite;
  // Songs get the small cover and the lyrics and up next card; radio keeps the big cover.
  const peek = !live;
  // Room under the cover for meta, seek, transport and actions (about 380pt).
  const coverSize = Math.min(
    width - COVER_GUTTER * 2,
    MAX_COVER,
    height - 380 - insets.top - insets.bottom
  );
  const open = (href: MetaHref) => {
    router.back();
    router.navigate(href);
  };

  const meta = (
    <Text
      variant="bodyMuted"
      numberOfLines={1}
      className={peek ? 'mt-1 text-[15px]' : 'mt-1 text-[16px]'}
    >
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

        {peek ? (
          <>
            <View className="flex-row items-end gap-4 pl-6 pr-[18px] pt-[18px]">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Lyrics full screen"
                onPress={() => router.push('/lyrics')}
                style={{ borderRadius: 18, boxShadow: '0 24px 40px -18px rgba(0,0,4,0.95)' }}
              >
                <ArtTile
                  title={track.title}
                  artUri={track.albumArt}
                  size={PEEK_COVER}
                  radius={18}
                />
              </Pressable>
              <View className="min-w-0 flex-1 pb-1.5">
                <Text variant="heading" numberOfLines={2}>
                  {track.title}
                </Text>
                {meta}
              </View>
              <View className="pb-0.5">{heart}</View>
            </View>
            <View className="mx-4 mt-[18px] min-h-0 flex-1">
              <PlayerCard
                track={track}
                lyrics={lyrics}
                loading={lyricsLoading}
                tab={tab}
                onTab={setTab}
              />
            </View>
          </>
        ) : (
          <>
            <View className="items-center pt-5">
              <Cover track={track} size={coverSize} />
            </View>
            <View className="flex-row items-center gap-3 pl-7 pr-[18px] pt-6">
              <View className="min-w-0 flex-1">
                <Text variant="title" numberOfLines={1}>
                  {track.title}
                </Text>
                {meta}
              </View>
              {heart}
            </View>
          </>
        )}

        <View className={peek ? 'px-7 pt-4' : 'px-7 pt-[18px]'}>
          <SeekBar />
        </View>
        <View className="px-[22px] pt-3.5">
          <Transport />
        </View>
        <View className={peek ? 'px-4 pt-1' : 'mt-auto px-4 pt-4'}>
          <PlayerActions />
        </View>
      </View>
      <RemovalToast bottom={Math.max(insets.bottom, 12) + 96} />
    </View>
  );
}
