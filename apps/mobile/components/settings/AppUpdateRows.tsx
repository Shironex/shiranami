import Constants from 'expo-constants';
import Download from 'lucide-react-native/icons/download';
import Info from 'lucide-react-native/icons/info';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { Button } from '@/components/ui/button';
import {
  appUpdatesEnabled,
  describeRunningUpdate,
  useAppUpdate,
  type AppUpdateStatus,
} from '@/hooks/useAppUpdate';

const HINT: Record<Exclude<AppUpdateStatus, 'idle' | 'ready'>, string> = {
  checking: 'Checking',
  downloading: 'Downloading the update',
  upToDate: 'You have the latest version',
  error: 'Could not check. Try again later.',
};

function version(): string {
  return `Version ${Constants.expoConfig?.version ?? '0.1.0'}`;
}

/** The version row with a manual check; once an update is downloaded it offers Restart. */
function UpdateCheckRow() {
  const { status, check, restart } = useAppUpdate();
  const busy = status === 'checking' || status === 'downloading';

  if (status === 'ready') {
    return (
      <SettingsRow label="Update ready" hint="Restart to use it" icon={Download}>
        <Button
          size="compact"
          label="Restart"
          accessibilityLabel="Restart to update"
          onPress={restart}
        />
      </SettingsRow>
    );
  }
  return (
    <SettingsRow
      label={version()}
      hint={status === 'idle' ? describeRunningUpdate() : HINT[status]}
      icon={Info}
    >
      <Button
        variant="text"
        size="compact"
        label="Check"
        accessibilityLabel="Check for updates"
        disabled={busy}
        onPress={check}
      />
    </SettingsRow>
  );
}

/**
 * The About row: the version and what is running in one line, with a manual
 * check that dev builds leave out (they load JavaScript from Metro).
 */
export function AppUpdateRows() {
  if (!appUpdatesEnabled()) {
    return <SettingsRow label={version()} hint={describeRunningUpdate()} icon={Info} />;
  }
  return <UpdateCheckRow />;
}
