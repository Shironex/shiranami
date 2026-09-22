import { IPC_CHANNELS, type MediaApi } from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { bareString } from '../narrowers';

const C = IPC_CHANNELS.media;

export const mediaApi: MediaApi = {
  // Two more command strings reach this channel in v2 than in v1: `play` and
  // `pause`. §2.7 suppresses the webview's media session, so souvlaki is the
  // single source and the two buttons v1 answered renderer-side through
  // `navigator.mediaSession.setActionHandler` now have to travel. They are
  // handled in `useMediaSession`, not here — see the note there for why the
  // switch is the only place that can answer them correctly.
  onCommand: callback =>
    subscribeChannel<string>(C.command, events.mediaCommand, bareString, callback),
  sendPlaybackState: async state => {
    await commands.mediaPlaybackState(state);
  },
  clearState: async () => {
    await commands.mediaClearState();
  },
};
