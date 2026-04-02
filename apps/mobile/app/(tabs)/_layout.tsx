import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { AnimatedTabBar } from '@/components/AnimatedTabBar';
import { MiniPlayer } from '@/components/player/MiniPlayer';

export default function TabsLayout() {
  return (
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
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="radio" options={{ title: 'Radio' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
