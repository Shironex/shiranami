import { Alert, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Disc3 from 'lucide-react-native/icons/disc-3';
import Heart from 'lucide-react-native/icons/heart';
import Info from 'lucide-react-native/icons/info';
import Laptop from 'lucide-react-native/icons/laptop';
import Library from 'lucide-react-native/icons/library';
import ListMusic from 'lucide-react-native/icons/list-music';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Wifi from 'lucide-react-native/icons/wifi';
import { PullItem, type PullStatus } from '@/components/sync/PullItem';
import { SyncNote } from '@/components/sync/SyncNote';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { WindowHeader, useWindowInset, useWindowScroll } from '@/components/window/WindowHeader';
import { useDesktopSync } from '@/hooks/useDesktopSync';
import { useNow } from '@/hooks/useNow';
import { countLabel } from '@/lib/format';
import {
  ONE_WAY_NOTE,
  lastSyncLine,
  progressRatio,
  songsLine,
  syncErrorLine,
} from '@/lib/sync-copy';
import type { SyncProgress, SyncStage } from '@/lib/sync-run';
import { colors } from '@/lib/theme';

const ORDER: SyncStage[] = ['connecting', 'favorites', 'playlists', 'library', 'covers', 'done'];

function statusOf(progress: SyncProgress | null, stage: SyncStage): PullStatus {
  const at = ORDER.indexOf(progress?.stage ?? 'connecting');
  const own = ORDER.indexOf(stage);
  if (at > own) return 'done';
  return at === own ? 'active' : 'waiting';
}

/** Favorites, playlists, library, covers: what the running pull has brought over. */
function PullList({ progress }: { progress: SyncProgress | null }) {
  const library = statusOf(progress, 'library');
  const covers = statusOf(progress, 'covers');
  return (
    <View className="pt-4">
      <PullItem
        icon={Heart}
        label="Favorites"
        hint={
          progress?.favorites != null ? countLabel(progress.favorites, 'song', 'songs') : 'First'
        }
        status={statusOf(progress, 'favorites')}
      />
      <PullItem
        icon={ListMusic}
        label="Playlists"
        hint={
          progress?.playlists != null
            ? countLabel(progress.playlists, 'playlist', 'playlists')
            : 'Next'
        }
        status={statusOf(progress, 'playlists')}
      />
      <PullItem
        icon={Library}
        label="Library"
        hint={progress && library !== 'waiting' ? songsLine(progress) : 'Then the songs'}
        status={library}
        ratio={progress?.songsTotal ? progress.songsDone / progress.songsTotal : undefined}
      />
      <PullItem
        icon={Disc3}
        label="Covers"
        hint={
          progress && covers !== 'waiting'
            ? `${progress.coversDone} of ${progress.coversTotal}`
            : 'After the songs'
        }
        status={covers}
        ratio={progress?.coversTotal ? progress.coversDone / progress.coversTotal : undefined}
      />
    </View>
  );
}

/** The paired desktop: the first pull while it runs, then a quiet status with Sync now. */
export default function SyncScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = useWindowInset();
  const { scrollY, onScroll } = useWindowScroll();
  const { peer, running, progress, error, last, syncNow, cancel, forget } = useDesktopSync();
  const now = useNow(30000);
  const name = peer?.desktopName ?? 'your desktop';

  const confirmForget = () =>
    Alert.alert(`Forget ${name}?`, 'The songs it brought over stay on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: async () => {
          const told = await forget();
          if (!told) {
            Alert.alert(
              'Forgotten on this phone',
              `${name} could not be reached. Remove this phone under Sync with phone on the desktop too.`
            );
          }
          router.back();
        },
      },
    ]);

  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: topInset, paddingBottom: insets.bottom + 32 }}
      >
        {running || !peer?.lastSyncAt ? (
          <>
            <View className="px-6 pt-2">
              <Text variant="title">Bringing your music over</Text>
              <Text variant="bodyMuted" className="mt-2">
                {`From ${name} on your Wi-Fi. You can leave this screen, it keeps going.`}
              </Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Sync progress"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(progressRatio(progress) * 100),
              }}
            >
              <PullList progress={running ? progress : null} />
            </View>
            {!!error && !running && (
              <Text variant="meta" className="px-6 pt-2 text-live" accessibilityLiveRegion="polite">
                {syncErrorLine(error, name)}
              </Text>
            )}
            <SyncNote icon={Wifi} className="mx-6 mt-4">
              Picks up where it stopped if the Wi-Fi drops. Songs already on the phone are matched,
              not copied twice.
            </SyncNote>
            <View className="mt-6 flex-row gap-3 px-6">
              {running ? (
                <Button label="Cancel" variant="tonal" className="flex-1" onPress={cancel} />
              ) : (
                <Button
                  label="Try again"
                  variant="tonal"
                  className="flex-1"
                  onPress={syncNow}
                  disabled={!peer}
                />
              )}
              <Button label="Keep listening" className="flex-1" onPress={() => router.back()} />
            </View>
          </>
        ) : (
          <>
            <View className="flex-row items-center gap-4 px-6 pt-2">
              <View className="h-16 w-16 items-center justify-center rounded-[20px] border border-primary-ring bg-primary-tonal">
                <Laptop size={28} color={colors.foreground} />
              </View>
              <View className="min-w-0 flex-1">
                <Text variant="heading" numberOfLines={1}>
                  {name}
                </Text>
                <View className="mt-1 flex-row items-center gap-1.5">
                  {!error && <CircleCheck size={16} color={colors.primary} />}
                  <Text variant="meta" className={error ? 'text-live' : undefined}>
                    {error ? syncErrorLine(error, name) : lastSyncLine(peer.lastSyncAt, now)}
                  </Text>
                </View>
              </View>
            </View>
            <View className="mt-5 flex-row gap-3 px-6">
              <Button label="Sync now" icon={RefreshCw} onPress={syncNow} />
            </View>
            {last && (
              <Text variant="meta" className="px-6 pt-4">
                {`Last time: ${countLabel(last.downloaded, 'new song', 'new songs')}, ${countLabel(
                  last.linked,
                  'song',
                  'songs'
                )} matched${last.failed ? `, ${last.failed} could not be copied` : ''}.`}
              </Text>
            )}
          </>
        )}
        <SyncNote icon={Info} className="mx-6 mt-6">
          {ONE_WAY_NOTE}
        </SyncNote>
        {!!peer && (
          <View className="mt-4 items-center">
            <Button
              label="Forget this desktop"
              variant="text"
              onPress={confirmForget}
              accessibilityHint="Unpairs this phone; the synced songs stay"
            />
          </View>
        )}
      </Animated.ScrollView>
      <WindowHeader
        title="Desktop"
        subtitle={peer ? name : undefined}
        photo="snow"
        scrollY={scrollY}
        leading={
          <IconButton
            icon={ArrowLeft}
            color={colors.foreground}
            accessibilityLabel="Back"
            onPress={() => router.back()}
          />
        }
      />
    </View>
  );
}
