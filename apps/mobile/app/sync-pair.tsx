import { useEffect } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import Camera from 'lucide-react-native/icons/camera';
import Info from 'lucide-react-native/icons/info';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import X from 'lucide-react-native/icons/x';
import { DeviceLink } from '@/components/sync/DeviceLink';
import { SyncNote } from '@/components/sync/SyncNote';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useDesktopPairing, type PairingScreenState } from '@/hooks/useDesktopPairing';
import { useDesktopSync } from '@/hooks/useDesktopSync';
import { pairingNotice } from '@/lib/sync-copy';
import { colors } from '@/lib/theme';

/** The finder's side, in points. */
const FINDER = 240;

function TopBar({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View className="flex-row items-center justify-between px-2.5">
      <IconButton icon={X} color={colors.foreground} accessibilityLabel="Close" onPress={onClose} />
      <Text variant="button" className="text-foreground">
        {title}
      </Text>
      <View className="w-11" />
    </View>
  );
}

function Step({ n, children }: { n: number; children: string }) {
  return (
    <View className="mt-3 flex-row items-center gap-3">
      <View className="h-7 w-7 items-center justify-center rounded-full bg-primary-tonal">
        <Text variant="caption">{String(n)}</Text>
      </View>
      <Text variant="body" className="flex-1 text-soft-foreground">
        {children}
      </Text>
    </View>
  );
}

/** Camera with the finder and a short sheet: what to point at, and where it is on the desktop. */
function ScanView({
  wrongCode,
  onScan,
  onClose,
}: {
  wrongCode: boolean;
  onScan: (data: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const granted = permission?.granted ?? false;

  return (
    <View className="flex-1 bg-black">
      {granted && (
        <CameraView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={result => onScan(result.data)}
        />
      )}
      <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
        <TopBar title="Pair with desktop" onClose={onClose} />
        <View className="flex-1 items-center justify-center">
          {granted ? (
            <View
              accessibilityLabel="Code finder"
              className="rounded-[28px] border-2 border-foreground"
              style={{ width: FINDER, height: FINDER }}
            />
          ) : (
            <View className="items-center px-10">
              <Camera size={32} color={colors.softForeground} />
              <Text variant="body" className="mt-4 text-center text-soft-foreground">
                {permission && !permission.canAskAgain
                  ? 'Camera access is off for Shiranami. Turn it on in the phone settings to scan the code.'
                  : 'Shiranami needs the camera to scan the pairing code on your desktop.'}
              </Text>
              <Button
                className="mt-6"
                label={permission && !permission.canAskAgain ? 'Open settings' : 'Allow camera'}
                onPress={() =>
                  permission && !permission.canAskAgain
                    ? Linking.openSettings()
                    : requestPermission()
                }
              />
            </View>
          )}
        </View>
      </View>
      <View
        className="rounded-t-[28px] bg-sheet px-6 pt-6"
        style={{ paddingBottom: insets.bottom + 24 }}
      >
        <Text variant="sheetTitle">Point at the code on your desktop</Text>
        <Text variant="bodyMuted" className="mt-2" accessibilityLiveRegion="polite">
          {wrongCode
            ? 'That is not a Shiranami pairing code. Scan the code under Sync with phone on the desktop.'
            : 'Both devices need to be on the same Wi-Fi. Nothing goes through the internet.'}
        </Text>
        <Step n={1}>On the desktop, open Settings, then Sync with phone</Step>
        <Step n={2}>Choose Pair a phone</Step>
      </View>
    </View>
  );
}

/** Finding the desktop, then waiting for its user to press Allow. */
function WaitView({
  state,
  onCancel,
}: {
  state: Extract<PairingScreenState, { kind: 'connecting' | 'waiting' }>;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const waiting = state.kind === 'waiting';
  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
    >
      <TopBar title="" onClose={onCancel} />
      <View className="mt-10 px-6">
        <DeviceLink />
        <Text variant="title" className="mt-8 text-center">
          {waiting ? `Allow on ${state.desktopName}` : `Looking for ${state.desktopName}`}
        </Text>
        <Text variant="bodyMuted" className="mt-3 text-center" accessibilityLiveRegion="polite">
          {waiting
            ? `${state.desktopName} is asking whether to pair with this phone. Press Allow there to finish.`
            : 'Trying the addresses in the code on your Wi-Fi.'}
        </Text>
        <View className="mt-6 flex-row items-center justify-center gap-2">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="meta">
            {waiting ? `Waiting for the desktop · ${state.host}` : 'Connecting'}
          </Text>
        </View>
        <SyncNote icon={Info} className="mt-10">
          No prompt on the desktop? Make sure Shiranami is open there and both are on the same
          Wi-Fi, not a guest network.
        </SyncNote>
      </View>
      <View className="flex-1" />
      <View className="items-center">
        <Button label="Cancel" variant="text" onPress={onCancel} />
      </View>
    </View>
  );
}

function FailedView({
  state,
  onRetry,
  onClose,
}: {
  state: Extract<PairingScreenState, { kind: 'failed' }>;
  onRetry: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const notice = pairingNotice(state.error, state.desktopName);
  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
    >
      <TopBar title="" onClose={onClose} />
      <View className="mt-16 items-center px-8">
        <TriangleAlert size={36} color={colors.live} />
        <Text variant="title" className="mt-6 text-center" accessibilityLiveRegion="assertive">
          {notice.title}
        </Text>
        <Text variant="bodyMuted" className="mt-3 text-center">
          {notice.body}
        </Text>
      </View>
      <View className="flex-1" />
      <View className="flex-row gap-3 px-6">
        <Button label="Close" variant="tonal" className="flex-1" onPress={onClose} />
        <Button label="Scan again" className="flex-1" onPress={onRetry} />
      </View>
    </View>
  );
}

/** Settings > Desktop > Sync with desktop: scan, wait for Allow, then start the first pull. */
export default function SyncPairScreen() {
  const router = useRouter();
  const { state, onScan, cancel, retry } = useDesktopPairing();
  const { syncNow } = useDesktopSync();

  useEffect(() => {
    if (state.kind !== 'paired') return;
    syncNow();
    router.replace('/sync');
  }, [state.kind, router, syncNow]);

  const close = () => {
    cancel();
    router.back();
  };

  switch (state.kind) {
    case 'scanning':
      return <ScanView wrongCode={state.wrongCode} onScan={onScan} onClose={close} />;
    case 'connecting':
    case 'waiting':
      return <WaitView state={state} onCancel={cancel} />;
    case 'failed':
      return <FailedView state={state} onRetry={retry} onClose={close} />;
    case 'paired':
      return <View className="flex-1 bg-background" />;
  }
}
