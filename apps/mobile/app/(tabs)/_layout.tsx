import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Scrim } from '@/components/art/Scrim';
import { BottomNav } from '@/components/nav/BottomNav';
import { OfflineBanner } from '@/components/OfflineBanner';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { useAppShortcuts } from '@/hooks/useAppShortcuts';
import { useInitialData } from '@/hooks/useInitialData';
import { env } from '@/lib/env';
import { colors } from '@/lib/theme';

const FADE = [
  { at: 0, color: colors.background, opacity: 0 },
  { at: 0.7, color: colors.background, opacity: 1 },
] as const;

/** Rows fade out above the mini player instead of being cut by it. */
function BottomFade() {
  return (
    <View pointerEvents="none" className="absolute -top-[96px] left-0 right-0 h-24">
      <Scrim stops={FADE} />
    </View>
  );
}

export default function TabsLayout() {
  const libraryLoaded = useInitialData();
  useAppShortcuts(libraryLoaded);
  return (
    <View className="flex-1 bg-background">
      <OfflineBanner />
      <Tabs
        tabBar={props => (
          <View>
            <BottomFade />
            <MiniPlayer />
            <BottomNav {...props} />
          </View>
        )}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" options={{ title: 'Library' }} />
        <Tabs.Screen name="playlists" options={{ title: 'Playlists' }} />
        <Tabs.Screen name="radio" options={{ title: 'Radio' }} />
        {/* YouTube search is out of scope for v0.1; the screen stays in the
            tree so turning the flag on brings it back unchanged. */}
        <Tabs.Protected guard={env.youtubeSearch}>
          <Tabs.Screen name="search" options={{ title: 'Search' }} />
        </Tabs.Protected>
      </Tabs>
    </View>
  );
}
