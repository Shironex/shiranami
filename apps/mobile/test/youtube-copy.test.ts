import { ApiError } from '@/lib/api';
import { savingLine, searchErrorLine, trackErrorLine } from '@/lib/youtube-copy';

describe('youtube copy', () => {
  it('explains each search failure without protocol words', () => {
    expect(searchErrorLine(new ApiError('no_key'))).toMatch(/no server key/);
    expect(searchErrorLine(new ApiError('unauthorized'))).toMatch(/Settings, Advanced/);
    expect(searchErrorLine(new ApiError('unreachable'))).toMatch(/Can't reach the server/);
    expect(searchErrorLine(new Error('boom'))).toMatch(/Try again/);
  });

  it('keeps row lines short', () => {
    expect(trackErrorLine(new ApiError('unavailable'))).toBe("This video can't be played");
    expect(trackErrorLine(new Error('disk'))).toBe("Couldn't save, try again");
  });

  it('shows whole percents, clamped', () => {
    expect(savingLine(0.429)).toBe('Saving 42%');
    expect(savingLine(2)).toBe('Saving 100%');
    expect(savingLine(-1)).toBe('Saving 0%');
  });
});
