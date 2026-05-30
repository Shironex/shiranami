import { describe, it, expect, beforeEach, vi } from 'vitest';

const sendToRenderer = vi.fn();
vi.mock('./utils/window', () => ({
  sendToRenderer: (...args: unknown[]) => sendToRenderer(...args),
}));

import { emitSystemNotice, resetSystemNotice, __resetSystemNoticeState } from './system-notice';

describe('emitSystemNotice', () => {
  beforeEach(() => {
    sendToRenderer.mockClear();
    __resetSystemNoticeState();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  it('sends the notice over the system:notice channel', () => {
    emitSystemNotice({ source: 'discord', level: 'warn', code: 'discordLoginFailed' });
    expect(sendToRenderer).toHaveBeenCalledTimes(1);
    expect(sendToRenderer).toHaveBeenCalledWith('system:notice', {
      source: 'discord',
      level: 'warn',
      code: 'discordLoginFailed',
    });
  });

  it('dedupes repeat notices for the same source:code within the cooldown', () => {
    emitSystemNotice({ source: 'album-art', level: 'warn', code: 'albumArtPruneFailed' });
    emitSystemNotice({ source: 'album-art', level: 'warn', code: 'albumArtPruneFailed' });
    expect(sendToRenderer).toHaveBeenCalledTimes(1);
  });

  it('lets a notice through again after the cooldown elapses', () => {
    emitSystemNotice(
      { source: 'album-art', level: 'warn', code: 'albumArtPruneFailed' },
      { cooldownMs: 1000 }
    );
    vi.setSystemTime(1500);
    emitSystemNotice(
      { source: 'album-art', level: 'warn', code: 'albumArtPruneFailed' },
      { cooldownMs: 1000 }
    );
    expect(sendToRenderer).toHaveBeenCalledTimes(2);
  });

  it('does not dedupe across different codes', () => {
    emitSystemNotice({ source: 'discord', level: 'warn', code: 'a' });
    emitSystemNotice({ source: 'discord', level: 'warn', code: 'b' });
    expect(sendToRenderer).toHaveBeenCalledTimes(2);
  });

  it('resetSystemNotice clears the cooldown so the next emit goes through', () => {
    emitSystemNotice({ source: 'discord', level: 'warn', code: 'discordLoginFailed' });
    resetSystemNotice('discord', 'discordLoginFailed');
    emitSystemNotice({ source: 'discord', level: 'warn', code: 'discordLoginFailed' });
    expect(sendToRenderer).toHaveBeenCalledTimes(2);
  });
});
