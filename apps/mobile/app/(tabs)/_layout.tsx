import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedTabBar } from '@/components/AnimatedTabBar';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { OfflineBanner } from '@/components/OfflineBanner';
import { env } from '@/lib/env';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: insets.top ? 0 : undefined }}>
        <OfflineBanner />
      </View>
      <Tabs
        tabBar={props => (
          <View>
            <MiniPlayer />
            <AnimatedTabBar {...props} />
          </View>
        )}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Library' }} />
        {/* YouTube search is out of scope for v0.1; the screen stays in the
            tree so turning the flag on brings it back unchanged. */}
        <Tabs.Protected guard={env.youtubeSearch}>
          <Tabs.Screen name="search" options={{ title: 'Search' }} />
        </Tabs.Protected>
        <Tabs.Screen name="radio" options={{ title: 'Radio' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
    </View>
  );
}
