import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Updates from 'expo-updates';
import { AppUpdateRows } from '@/components/settings/AppUpdateRows';

type MutableUpdates = {
  -readonly [K in 'isEnabled' | 'updateId' | 'channel' | 'isEmbeddedLaunch']: (typeof Updates)[K];
};

jest.mock('expo-updates', () => ({
  isEnabled: true,
  updateId: null,
  channel: null,
  isEmbeddedLaunch: true,
  useUpdates: jest.fn(() => ({ isUpdatePending: false })),
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

const updates = Updates as unknown as MutableUpdates;
const useUpdates = jest.mocked(Updates.useUpdates);
const checkForUpdate = jest.mocked(Updates.checkForUpdateAsync);
const fetchUpdate = jest.mocked(Updates.fetchUpdateAsync);
const reload = jest.mocked(Updates.reloadAsync);

// Rows are hidden in dev builds; the release branch is what ships.
const globals = globalThis as unknown as { __DEV__: boolean };
const devFlag = globals.__DEV__;

beforeEach(() => {
  globals.__DEV__ = false;
  Object.assign(updates, {
    isEnabled: true,
    updateId: null,
    channel: 'preview',
    isEmbeddedLaunch: true,
  });
  useUpdates.mockReturnValue({ isUpdatePending: false } as ReturnType<typeof Updates.useUpdates>);
});

afterAll(() => {
  globals.__DEV__ = devFlag;
});

describe('AppUpdateRows', () => {
  it('shows the channel and that the bundle in the build is running', async () => {
    await render(<AppUpdateRows />);
    expect(screen.getByText('preview · built in')).toBeTruthy();
  });

  it('shows a short update id once an update is running', async () => {
    Object.assign(updates, {
      updateId: '0f3c9a1e-7b2d-4c55-9a10-2b7e1c4d8f60',
      isEmbeddedLaunch: false,
    });
    await render(<AppUpdateRows />);
    expect(screen.getByText('preview · 0f3c9a1e')).toBeTruthy();
  });

  it('hides the check in a dev build', async () => {
    globals.__DEV__ = true;
    await render(<AppUpdateRows />);
    expect(screen.getByText('Development build')).toBeTruthy();
    expect(screen.queryByLabelText('Check for updates')).toBeNull();
  });

  it('reports the latest version when nothing new is published', async () => {
    checkForUpdate.mockResolvedValue({ isAvailable: false } as Updates.UpdateCheckResult);
    await render(<AppUpdateRows />);

    await fireEvent.press(screen.getByLabelText('Check for updates'));

    await waitFor(() => expect(screen.getByText('You have the latest version')).toBeTruthy());
    expect(fetchUpdate).not.toHaveBeenCalled();
  });

  it('downloads an available update and restarts into it', async () => {
    checkForUpdate.mockResolvedValue({ isAvailable: true } as Updates.UpdateCheckResult);
    fetchUpdate.mockResolvedValue({ isNew: true } as Updates.UpdateFetchResult);
    await render(<AppUpdateRows />);

    await fireEvent.press(screen.getByLabelText('Check for updates'));
    await waitFor(() => expect(screen.getByText('Update ready, restart to use it')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Restart to update'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('offers a restart when the launch check already downloaded an update', async () => {
    useUpdates.mockReturnValue({ isUpdatePending: true } as ReturnType<typeof Updates.useUpdates>);
    await render(<AppUpdateRows />);
    expect(screen.getByLabelText('Restart to update')).toBeTruthy();
  });

  it('says so when the check fails', async () => {
    checkForUpdate.mockRejectedValue(new Error('offline'));
    await render(<AppUpdateRows />);

    await fireEvent.press(screen.getByLabelText('Check for updates'));

    await waitFor(() => expect(screen.getByText('Could not check. Try again later.')).toBeTruthy());
  });
});
