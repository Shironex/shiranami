import { IPC_CHANNELS, type CompanionApi, type CompanionXpGain } from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { companionXp } from '../narrowers';

const C = IPC_CHANNELS.companion;

export const companionApi: CompanionApi = {
  getState: () => commands.companionGetState(),
  setName: name => commands.companionSetName(name),
  setSpecies: species => commands.companionSetSpecies(species),
  setAccessories: accessories => commands.companionSetAccessories(accessories),
  onXp: callback =>
    subscribeChannel<CompanionXpGain>(C.xp, events.companionXp, companionXp, callback),
};
