import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useDesktopSync } from '@/hooks/useDesktopSync';
import { useForgetDesktop } from '@/hooks/useForgetDesktop';
import { useNow } from '@/hooks/useNow';
import {
  ONE_WAY_NOTE,
  lastSyncLine,
  progressLine,
  progressRatio,
  syncErrorLine,
} from '@/lib/sync-copy';

/**
 * Settings > Desktop. Unpaired: one row that opens the scanner. Paired: the
 * desktop by name with the last sync, Sync now (or the running pull with
 * Cancel), and Forget this desktop.
 */
export function DesktopSyncRows() {
  const router = useRouter();
  const { loaded, peer, running, progress, error, syncNow, cancel } = useDesktopSync();
  const now = useNow(30000);
  const confirmForget = useForgetDesktop(peer?.desktopName ?? 'your desktop');

  if (!loaded) return null;
  if (!peer) {
    return (
      <SettingsRow label="Sync with desktop" hint="Copy your desktop library over home Wi-Fi">
        <Button
          label="Pair"
          variant="tonal"
          size="compact"
          onPress={() => router.push('/sync-pair')}
        />
      </SettingsRow>
    );
  }

  const name = peer.desktopName;
  const ratio = progressRatio(progress);
  return (
    <>
      <SettingsRow
        label={name}
        hint={
          running
            ? undefined
            : error
              ? syncErrorLine(error, name)
              : lastSyncLine(peer.lastSyncAt, now)
        }
      >
        {running ? (
          <Button
            label="Details"
            variant="text"
            size="compact"
            onPress={() => router.push('/sync')}
          />
        ) : (
          <Button label="Sync now" variant="tonal" size="compact" onPress={syncNow} />
        )}
      </SettingsRow>
      {running && (
        <View className="px-6 pb-2">
          <View className="flex-row items-center gap-3">
            <Text
              variant="meta"
              className="flex-1"
              style={{ fontVariant: ['tabular-nums'] }}
              accessibilityLiveRegion="polite"
            >
              {progressLine(progress)}
            </Text>
            <Button label="Cancel" variant="text" size="compact" onPress={cancel} />
          </View>
          <View
            className="mt-1 h-1 overflow-hidden rounded-full bg-border"
            accessibilityRole="progressbar"
            accessibilityLabel="Syncing with the desktop"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
          >
            <View className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
          </View>
        </View>
      )}
      <Text variant="meta" className="px-6 pb-1">
        {ONE_WAY_NOTE}
      </Text>
      <View className="flex-row px-3">
        <Button
          label="Forget this desktop"
          variant="text"
          size="compact"
          onPress={confirmForget}
          accessibilityHint="Unpairs this phone; the synced songs stay"
        />
      </View>
    </>
  );
}
