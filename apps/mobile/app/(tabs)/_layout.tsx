import { useState } from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { RemovalToast } from '@/components/library/RemovalToast';
import { Dock, DockHeightProvider } from '@/components/nav/Dock';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useAppShortcuts } from '@/hooks/useAppShortcuts';
import { useInitialData } from '@/hooks/useInitialData';
import { env } from '@/lib/env';

export default function TabsLayout() {
  const libraryLoaded = useInitialData();
  useAppShortcuts(libraryLoaded);
  const [dockHeight, setDockHeight] = useState(0);
  return (
    <DockHeightProvider value={dockHeight}>
      <View className="flex-1 bg-background">
        <OfflineBanner />
        <Tabs
          tabBar={props => <Dock {...props} onHeight={setDockHeight} />}
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
        <RemovalToast bottom={dockHeight + 8} />
      </View>
    </DockHeightProvider>
  );
}
