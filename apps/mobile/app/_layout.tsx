import '@/global.css';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
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
import { startPlaybackService } from '@/lib/playback-service';

export { ErrorBoundary } from 'expo-router';

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

  const handleAppReady = useCallback(() => {
    SplashScreen.hideAsync();
    setAppReady(true);
  }, []);

  const handleSplashDismissed = useCallback(() => {
    setSplashDone(true);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Suspense fallback={<LoadingFallback />}>
        <SQLiteProvider databaseName="shiranami.db" onInit={migrateDbIfNeeded} useSuspense>
          <SettingsProvider>
            <ThemeProvider value={NAV_THEME}>
              <StatusBar style="light" />
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="player"
                  options={{
                    headerShown: false,
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }}
                />
              </Stack>
              <PortalHost />
              {fontsReady && <ReadySignal onReady={handleAppReady} />}
            </ThemeProvider>
          </SettingsProvider>
        </SQLiteProvider>
      </Suspense>
      {!splashDone && <AnimatedSplash ready={appReady} onDismissed={handleSplashDismissed} />}
    </View>
  );
}
