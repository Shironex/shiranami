import { TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import { ArtTile } from '@/components/art/ArtTile';
import { ScanProgress } from '@/components/library/ScanProgress';
import { Button } from '@/components/ui/button';
import { AppUpdateRows } from '@/components/settings/AppUpdateRows';
import { DesktopSyncRows } from '@/components/settings/DesktopSyncRows';
import { SettingsRow, SettingsValue } from '@/components/settings/SettingsRow';
import { ChipRow } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { GroupLabel } from '@/components/ui/list-row';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { WindowHeader, useWindowInset, useWindowScroll } from '@/components/window/WindowHeader';
import { useSettingsContext } from '@/context/SettingsContext';
import { useLibraryActions } from '@/hooks/useLibraryActions';
import { useLibraryScan } from '@/hooks/useLibraryScan';
import type { PlaceholderArt } from '@/hooks/useSettings';
import { describeScan } from '@/lib/library-scan';
import { permissionNote } from '@/lib/media-permission';
import { colors } from '@/lib/theme';
import { useAppStore } from '@/stores/useAppStore';

const ART_OPTIONS: { value: PlaceholderArt; label: string }[] = [
  { value: 'kanji', label: 'Kanji' },
  { value: 'photo', label: 'Photo' },
];
const SAMPLE_TITLES = ['Snowfall', 'Midnight Rain', 'Coffee Break'];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettingsContext();
  const serverUrl = useAppStore(s => s.serverUrl);
  const setServerUrl = useAppStore(s => s.setServerUrl);
  const { scrollY, onScroll } = useWindowScroll();
  const topInset = useWindowInset();
  const version = Constants.expoConfig?.version ?? '0.1.0';
  const scan = useLibraryScan();
  const { importFiles, importing } = useLibraryActions();
  const scanHint =
    permissionNote(scan.permission) ??
    scan.error ??
    (scan.last ? describeScan(scan.last) : 'Adds new songs, updates changed ones');

  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: topInset, paddingBottom: insets.bottom + 32 }}
      >
        <GroupLabel className="px-6">Appearance</GroupLabel>
        <SettingsRow label="Tab labels" hint="Names under the icons in the bottom bar">
          <Switch
            value={settings.showLabels}
            onValueChange={value => update('showLabels', value)}
            accessibilityLabel="Tab labels"
          />
        </SettingsRow>
        <SettingsRow label="Placeholder art" hint="For songs and stations without a cover" />
        <View className="flex-row items-center justify-between px-6 pb-2">
          <ChipRow
            options={ART_OPTIONS}
            value={settings.placeholderArt}
            onChange={value => update('placeholderArt', value)}
          />
          <View className="flex-row gap-2" accessibilityElementsHidden>
            {SAMPLE_TITLES.map(title => (
              <ArtTile key={title} title={title} size={40} radius={10} />
            ))}
          </View>
        </View>

        <GroupLabel className="px-6 pt-8">Library</GroupLabel>
        <SettingsRow label="Scan music on this phone" hint={scan.running ? undefined : scanHint}>
          {!scan.running && (
            <Button
              label={
                scan.permission === 'blocked' ? 'Open settings' : scan.last ? 'Rescan' : 'Scan'
              }
              variant="tonal"
              size="compact"
              onPress={scan.permission === 'blocked' ? scan.openSettings : scan.scan}
            />
          )}
        </SettingsRow>
        {scan.running && (
          <ScanProgress
            done={scan.done}
            total={scan.total}
            onCancel={scan.cancel}
            className="px-6 pb-2"
          />
        )}
        <SettingsRow label="Import files" hint="Songs already in the library are skipped">
          <Button
            label={importing ? 'Importing' : 'Import'}
            variant="tonal"
            size="compact"
            onPress={importFiles}
            disabled={importing}
          />
        </SettingsRow>

        <GroupLabel className="px-6 pt-8">Desktop</GroupLabel>
        <DesktopSyncRows />

        <GroupLabel className="px-6 pt-8">Server</GroupLabel>
        <View className="px-6 pt-1">
          <Text variant="meta" className="mb-2">
            Optional. Your library and radio work without it.
          </Text>
          <TextInput
            value={serverUrl}
            onChangeText={url => {
              setServerUrl(url);
              update('serverUrl', url);
            }}
            placeholder="https://api.shiranami.app"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Server URL"
            className="h-14 rounded-xl border border-border-strong bg-muted px-4 font-body text-[16px] text-foreground focus:border-primary"
          />
        </View>

        <GroupLabel className="px-6 pt-8">About</GroupLabel>
        <SettingsRow label="Version">
          <SettingsValue>{version}</SettingsValue>
        </SettingsRow>
        <AppUpdateRows />
      </Animated.ScrollView>
      <WindowHeader
        title="Settings"
        photo="snow"
        scrollY={scrollY}
        leading={
          <IconButton
            icon={ArrowLeft}
            color={colors.foreground}
            accessibilityLabel="Back"
            onPress={() => router.back()}
          />
        }
      />
    </View>
  );
}
