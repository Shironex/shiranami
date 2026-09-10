import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Globe, Info, Tag } from 'lucide-react-native';
import Constants from 'expo-constants';
import { Text } from '@/components/ui/text';
import { useSettingsContext } from '@/context/SettingsContext';
import { useAppStore } from '@/stores/useAppStore';
import { colors } from '@/lib/theme';

function SettingsRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.FC<{ size: number; color: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.row}>
      <View style={s.rowLeft}>
        <Icon size={18} color={colors.mutedForeground} />
        <Text style={s.rowLabel}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettingsContext();
  const { serverUrl, setServerUrl } = useAppStore();

  const version = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <ScrollView style={[s.container, { paddingTop: insets.top }]} contentContainerStyle={s.content}>
      <Text style={s.headerTitle}>Settings</Text>

      {/* Server */}
      <Text style={s.sectionTitle}>Server</Text>
      <View style={s.card}>
        <SettingsRow icon={Globe} label="Server URL">
          <TextInput
            value={serverUrl}
            onChangeText={url => {
              setServerUrl(url);
              update('serverUrl', url);
            }}
            placeholder="https://api.shiranami.app"
            placeholderTextColor={colors.mutedForeground}
            style={s.textInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </SettingsRow>
      </View>

      {/* Appearance */}
      <Text style={s.sectionTitle}>Appearance</Text>
      <View style={s.card}>
        <SettingsRow icon={Tag} label="Show tab labels">
          <Pressable
            onPress={() => update('showLabels', !settings.showLabels)}
            style={[s.toggle, settings.showLabels && s.toggleActive]}
          >
            <View style={[s.toggleThumb, settings.showLabels && s.toggleThumbActive]} />
          </Pressable>
        </SettingsRow>
      </View>

      {/* About */}
      <Text style={s.sectionTitle}>About</Text>
      <View style={s.card}>
        <SettingsRow icon={Info} label="Version">
          <Text style={s.rowValue}>{version}</Text>
        </SettingsRow>
      </View>

      <Text style={s.footer}>Shiranami — Your personal music sanctuary</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 100,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.foreground,
  },
  rowValue: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  textInput: {
    fontSize: 14,
    color: colors.foreground,
    textAlign: 'right',
    flex: 1,
    maxWidth: 200,
    paddingVertical: 0,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.foreground,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  footer: {
    fontSize: 13,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 16,
  },
});
