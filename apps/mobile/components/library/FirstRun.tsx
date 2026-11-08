import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Smartphone from 'lucide-react-native/icons/smartphone';
import { Scrim } from '@/components/art/Scrim';
import { ThemePhoto } from '@/components/art/ThemePhoto';
import { ScanProgress } from '@/components/library/ScanProgress';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useLibraryScan } from '@/hooks/useLibraryScan';
import { describeScan } from '@/lib/library-scan';
import { permissionNote } from '@/lib/media-permission';
import { colors } from '@/lib/theme';

const MASCOT = require('../../assets/images/mascot.png');

const SCRIM = [
  { at: 0.4, color: colors.shade, opacity: 0 },
  { at: 1, color: colors.shade, opacity: 0.75 },
] as const;

/** The empty library: the window with the mascot on the sill, and the ways in. */
export function FirstRun({ onImport, importing }: { onImport: () => void; importing: boolean }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scan = useLibraryScan();
  // After a scan that found nothing, or a refused permission, say why in one line.
  const note =
    permissionNote(scan.permission) ??
    scan.error ??
    (scan.last && !scan.running ? describeScan(scan.last) : null);
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
          Scan the music on this phone, or import files. Nothing leaves the device.
        </Text>
        {scan.running ? (
          <ScanProgress
            done={scan.done}
            total={scan.total}
            onCancel={scan.cancel}
            className="mt-6 max-w-[320px]"
          />
        ) : (
          <View className="mt-6 items-center gap-1">
            <Button
              label="Scan music on this phone"
              icon={Smartphone}
              onPress={scan.scan}
              disabled={importing}
            />
            {!!note && (
              <Text variant="meta" className="mt-2 max-w-[290px] text-center">
                {note}
              </Text>
            )}
            {scan.permission === 'blocked' && (
              <Button label="Open settings" variant="text" onPress={scan.openSettings} />
            )}
            <Button
              label={importing ? 'Importing' : 'Import files'}
              variant="text"
              onPress={onImport}
              disabled={importing}
            />
            <Button
              label="Listen to radio"
              variant="text"
              onPress={() => router.navigate('/radio')}
            />
          </View>
        )}
      </View>
    </View>
  );
}
