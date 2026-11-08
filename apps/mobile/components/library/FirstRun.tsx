import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FolderOpen from 'lucide-react-native/icons/folder-open';
import { Scrim } from '@/components/art/Scrim';
import { ThemePhoto } from '@/components/art/ThemePhoto';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

const MASCOT = require('../../assets/images/mascot.png');

const SCRIM = [
  { at: 0.4, color: colors.shade, opacity: 0 },
  { at: 1, color: colors.shade, opacity: 0.75 },
] as const;

/** The empty library: the window with the mascot on the sill, and two ways in. */
export function FirstRun({ onImport, importing }: { onImport: () => void; importing: boolean }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View className="flex-1 bg-background px-4" style={{ paddingTop: insets.top + 8 }}>
      <ThemePhoto
        photo="lofi-night"
        x={66}
        y={40}
        className="h-[312px] rounded-panel border border-border"
      >
        <Scrim stops={SCRIM} />
        <Image
          source={MASCOT}
          accessibilityIgnoresInvertColors
          className="absolute -bottom-1.5 self-center"
          style={{ width: 150, height: 150 }}
        />
      </ThemePhoto>
      <View className="items-center px-3 pt-7">
        <Text variant="heading" className="text-center">
          No music here yet
        </Text>
        <Text variant="bodyMuted" className="mt-2 max-w-[290px] text-center">
          Import audio files from this phone. They stay on the device.
        </Text>
        <View className="mt-6 items-center gap-1">
          <Button
            label={importing ? 'Importing' : 'Import files'}
            icon={FolderOpen}
            onPress={onImport}
            disabled={importing}
          />
          <Button
            label="Listen to radio"
            variant="text"
            onPress={() => router.navigate('/radio')}
          />
        </View>
      </View>
    </View>
  );
}
