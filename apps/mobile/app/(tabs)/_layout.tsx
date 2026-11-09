import { useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Tabs } from 'expo-router';
import { QueueToast } from '@/components/library/QueueToast';
import { RemovalToast } from '@/components/library/RemovalToast';
import { Dock, DockHeightProvider } from '@/components/nav/Dock';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useAppShortcuts } from '@/hooks/useAppShortcuts';
import { useInitialData } from '@/hooks/useInitialData';
import { env } from '@/lib/env';
import { TAB_TRANSITION, TAB_TRANSITION_REDUCED } from '@/lib/tab-motion';

export default function TabsLayout() {
  const libraryLoaded = useInitialData();
  useAppShortcuts(libraryLoaded);
  const [dockHeight, setDockHeight] = useState(0);
  const reduceMotion = useReducedMotion();
  return (
    <DockHeightProvider value={dockHeight}>
      <View className="flex-1 bg-background">
        <OfflineBanner />
        <Tabs
          tabBar={props => <Dock {...props} onHeight={setDockHeight} />}
          screenOptions={{
            headerShown: false,
            ...(reduceMotion ? TAB_TRANSITION_REDUCED : TAB_TRANSITION),
          }}
        >
          <Tabs.Screen name="(library)" options={{ title: 'Library' }} />
          <Tabs.Screen name="playlists" options={{ title: 'Playlists' }} />
          <Tabs.Screen name="radio" options={{ title: 'Radio' }} />
          {/* YouTube search is out of scope for v0.1; the screen stays in the
              tree so turning the flag on brings it back unchanged. */}
          <Tabs.Protected guard={env.youtubeSearch}>
            <Tabs.Screen name="search" options={{ title: 'Search' }} />
          </Tabs.Protected>
        </Tabs>
        <RemovalToast bottom={dockHeight + 8} />
        <QueueToast bottom={dockHeight + 8} />
      </View>
    </DockHeightProvider>
  );
}
