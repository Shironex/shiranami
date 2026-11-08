import type { AudioLibraryModule, AudioPermission } from '@/modules/audio-library';
import { ensureAudioPermission, permissionNote, permissionState } from '@/lib/media-permission';

const response = (status: AudioPermission['status'], canAskAgain = true): AudioPermission => ({
  status,
  granted: status === 'granted',
  canAskAgain,
});

function native(current: AudioPermission, afterAsk: AudioPermission) {
  return {
    getPermissionAsync: jest.fn(async () => current),
    requestPermissionAsync: jest.fn(async () => afterAsk),
    queryAudioAsync: jest.fn(),
    readTracksAsync: jest.fn(),
  } as unknown as AudioLibraryModule & {
    requestPermissionAsync: jest.Mock;
  };
}

describe('audio permission', () => {
  it('maps Expo responses to scan states', () => {
    expect(permissionState(response('granted'))).toBe('granted');
    expect(permissionState(response('undetermined'))).toBe('undetermined');
    expect(permissionState(response('denied', true))).toBe('denied');
    expect(permissionState(response('denied', false))).toBe('blocked');
    expect(permissionState(null)).toBe('unavailable');
  });

  it('asks on the first scan and reports the answer', async () => {
    const granted = native(response('undetermined'), response('granted'));
    expect(await ensureAudioPermission(granted)).toBe('granted');
    expect(granted.requestPermissionAsync).toHaveBeenCalledTimes(1);

    const refused = native(response('undetermined'), response('denied', true));
    expect(await ensureAudioPermission(refused)).toBe('denied');
  });

  it('does not ask again when already granted or blocked for good', async () => {
    const granted = native(response('granted'), response('granted'));
    expect(await ensureAudioPermission(granted)).toBe('granted');
    const blocked = native(response('denied', false), response('denied', false));
    expect(await ensureAudioPermission(blocked)).toBe('blocked');
    expect(granted.requestPermissionAsync).not.toHaveBeenCalled();
    expect(blocked.requestPermissionAsync).not.toHaveBeenCalled();
  });

  it('asks again after a plain denial', async () => {
    const again = native(response('denied', true), response('granted'));
    expect(await ensureAudioPermission(again)).toBe('granted');
  });

  it('has nothing to ask without the native module', async () => {
    expect(await ensureAudioPermission(null)).toBe('unavailable');
  });

  it('explains every state that stops the scan', () => {
    expect(permissionNote('granted')).toBeNull();
    expect(permissionNote(null)).toBeNull();
    expect(permissionNote('denied')).toMatch(/import files/);
    expect(permissionNote('blocked')).toMatch(/settings/);
    expect(permissionNote('unavailable')).toBeTruthy();
  });
});
