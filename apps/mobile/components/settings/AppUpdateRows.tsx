import { SettingsRow, SettingsValue } from '@/components/settings/SettingsRow';
import { Button } from '@/components/ui/button';
import {
  appUpdatesEnabled,
  describeRunningUpdate,
  useAppUpdate,
  type AppUpdateStatus,
} from '@/hooks/useAppUpdate';

const HINT: Record<AppUpdateStatus, string> = {
  idle: 'Looks for a newer version of the app',
  checking: 'Checking',
  downloading: 'Downloading the update',
  ready: 'Update ready, restart to use it',
  upToDate: 'You have the latest version',
  error: 'Could not check. Try again later.',
};

function UpdateCheckRow() {
  const { status, check, restart } = useAppUpdate();
  const busy = status === 'checking' || status === 'downloading';
  const ready = status === 'ready';

  return (
    <SettingsRow label="Updates" hint={HINT[status]}>
      <Button
        variant="text"
        size="compact"
        label={ready ? 'Restart' : 'Check'}
        accessibilityLabel={ready ? 'Restart to update' : 'Check for updates'}
        disabled={busy}
        onPress={ready ? restart : check}
      />
    </SettingsRow>
  );
}

/**
 * The About rows for over the air updates: what is running, and a manual
 * check that dev builds leave out (they load JavaScript from Metro).
 */
export function AppUpdateRows() {
  return (
    <>
      <SettingsRow label="Running">
        <SettingsValue>{describeRunningUpdate()}</SettingsValue>
      </SettingsRow>
      {appUpdatesEnabled() && <UpdateCheckRow />}
    </>
  );
}
