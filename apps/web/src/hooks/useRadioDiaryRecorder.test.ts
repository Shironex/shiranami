import { describe, expect, it } from 'vitest';
import { radioStationUuid } from './useRadioDiaryRecorder';

const STATION = '11111111-1111-4111-8111-111111111111';

describe('radioStationUuid', () => {
  // `stationToTrack` mints `radio:<directory uuid>`; the diary is keyed on that
  // uuid, so this is the one place the two spellings meet.
  it('recovers the directory uuid from a radio track id', () => {
    expect(radioStationUuid(`radio:${STATION}`)).toBe(STATION);
  });

  it('refuses a library track id', () => {
    expect(radioStationUuid('track-1')).toBeNull();
  });

  // A bare prefix names no station, and filing a title under the empty string
  // would put every such title in one shared diary.
  it('refuses a prefix with nothing after it', () => {
    expect(radioStationUuid('radio:')).toBeNull();
  });
});
