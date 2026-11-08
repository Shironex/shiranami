import '@/global.css';
import '@/lib/crypto-polyfill';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NAV_THEME, colors } from '@/lib/theme';
import { useAppFonts } from '@/lib/use-app-fonts';
import { PortalHost } from '@rn-primitives/portal';
import { SQLiteProvider } from 'expo-sqlite';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { migrateDbIfNeeded } from '@/lib/db';
import { SettingsProvider } from '@/context/SettingsContext';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { useRemovalLifecycle } from '@/hooks/useRemovalLifecycle';
import { startPlaybackService } from '@/lib/playback-service';

export { ErrorBoundary } from 'expo-router';

/**
 * Bottom sheets are expo-router form sheets (native Material bottom sheets on
 * Android) sized to their content; components/ui/sheet.tsx draws the inside.
 */
const SHEET = {
  presentation: 'formSheet',
  sheetAllowedDetents: 'fitToContents',
  sheetCornerRadius: 28,
  contentStyle: { backgroundColor: colors.sheet },
} as const;

SplashScreen.preventAutoHideAsync();

function LoadingFallback() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const fontsReady = useAppFonts();

  useEffect(() => startPlaybackService(), []);
  useRemovalLifecycle();

  const handleAppReady = useCallback(() => {
    SplashScreen.hideAsync();
    setAppReady(true);
  }, []);

  const handleSplashDismissed = useCallback(() => {
    setSplashDone(true);
  }, []);

  return (
    // Swipe gestures on rows need the gesture handler root at the top of the tree.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <Suspense fallback={<LoadingFallback />}>
        <SQLiteProvider databaseName="shiranami.db" onInit={migrateDbIfNeeded} useSuspense>
          <SettingsProvider>
            <ThemeProvider value={NAV_THEME}>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="player"
                  options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                  name="lyrics"
                  options={{ presentation: 'fullScreenModal', animation: 'fade' }}
                />
                <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="sync" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="sync-pair" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="sleep" options={SHEET} />
                <Stack.Screen
                  name="queue"
                  options={{ ...SHEET, sheetAllowedDetents: [0.6, 0.92] }}
                />
                <Stack.Screen name="track/[id]" options={SHEET} />
                <Stack.Screen name="add-to-playlist" options={SHEET} />
                <Stack.Screen name="playlist-name" options={SHEET} />
              </Stack>
              <PortalHost />
              {fontsReady && <ReadySignal onReady={handleAppReady} />}
            </ThemeProvider>
          </SettingsProvider>
        </SQLiteProvider>
      </Suspense>
      {!splashDone && <AnimatedSplash ready={appReady} onDismissed={handleSplashDismissed} />}
    </GestureHandlerRootView>
  );
}
