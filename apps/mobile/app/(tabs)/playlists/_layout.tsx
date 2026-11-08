import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

/** Playlists and a playlist's songs stay inside the tab, under the mini player. */
export default function PlaylistsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade_from_bottom',
      }}
    />
  );
}
