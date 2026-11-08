import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

/** The library and its album and artist pages stay inside the tab, under the dock. */
export default function LibraryLayout() {
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
