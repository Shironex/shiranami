import { useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import FolderInput from 'lucide-react-native/icons/folder-input';
import ImageIcon from 'lucide-react-native/icons/image';
import Palette from 'lucide-react-native/icons/palette';
import Server from 'lucide-react-native/icons/server';
import Smartphone from 'lucide-react-native/icons/smartphone';
import { ArtTile } from '@/components/art/ArtTile';
import { ScanProgress } from '@/components/library/ScanProgress';
import { Button } from '@/components/ui/button';
import { AppUpdateRows } from '@/components/settings/AppUpdateRows';
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsRow';
import { IconButton } from '@/components/ui/icon-button';
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

const ART_LABELS: Record<PlaceholderArt, string> = { kanji: 'Kanji', photo: 'Photo' };
const SAMPLE_TITLES = ['Snowfall', 'Midnight Rain'];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettingsContext();
  const serverUrl = useAppStore(s => s.serverUrl);
  const setServerUrl = useAppStore(s => s.setServerUrl);
  const { scrollY, onScroll } = useWindowScroll();
  const topInset = useWindowInset();
  const scan = useLibraryScan();
  const { importFiles, importing } = useLibraryActions();
  const [advanced, setAdvanced] = useState(false);
  const scanHint =
    permissionNote(scan.permission) ??
    scan.error ??
    (scan.last ? describeScan(scan.last) : 'Adds new songs, updates changed ones');
  const otherArt: PlaceholderArt = settings.placeholderArt === 'kanji' ? 'photo' : 'kanji';

  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: topInset, paddingBottom: insets.bottom + 32 }}
      >
        <SettingsGroup title="Library">
          <SettingsRow
            label="Scan music on this phone"
            hint={scan.running ? undefined : scanHint}
            icon={Smartphone}
          >
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
              className="px-2 py-3"
            />
          )}
          <SettingsRow
            label="Import files"
            hint="Songs already in the library are skipped"
            icon={FolderInput}
          >
            <Button
              label={importing ? 'Importing' : 'Import'}
              variant="tonal"
              size="compact"
              onPress={importFiles}
              disabled={importing}
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Playback and look">
          <SettingsRow label="Tab labels" hint="Names under the icons in the dock" icon={Palette}>
            <Switch
              value={settings.showLabels}
              onValueChange={value => update('showLabels', value)}
              accessibilityLabel="Tab labels"
            />
          </SettingsRow>
          <SettingsRow
            label="Placeholder art"
            hint={ART_LABELS[settings.placeholderArt]}
            icon={ImageIcon}
            onPress={() => update('placeholderArt', otherArt)}
            accessibilityLabel={`Placeholder art, ${ART_LABELS[settings.placeholderArt]}`}
            accessibilityHint={`Switches to ${ART_LABELS[otherArt]}`}
          >
            <View className="flex-row gap-1.5" accessibilityElementsHidden>
              {SAMPLE_TITLES.map(title => (
                <ArtTile key={title} title={title} size={36} radius={9} />
              ))}
            </View>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="About">
          <AppUpdateRows />
          <View>
            <SettingsRow
              label="Advanced"
              hint="Server address"
              icon={Server}
              onPress={() => setAdvanced(open => !open)}
              accessibilityLabel="Advanced, server address"
            >
              {advanced ? (
                <ChevronDown size={20} color={colors.mutedForeground} />
              ) : (
                <ChevronRight size={20} color={colors.mutedForeground} />
              )}
            </SettingsRow>
            {advanced && (
              <View className="px-2 pb-4 pt-1">
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
            )}
          </View>
        </SettingsGroup>
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
