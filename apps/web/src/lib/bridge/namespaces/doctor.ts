import { IPC_CHANNELS, type DoctorApi, type DoctorProgress } from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { doctorProgress } from '../narrowers';

const C = IPC_CHANNELS.doctor;

export const doctorApi: DoctorApi = {
  scan: tracks => commands.doctorScan(tracks),
  cancel: async () => {
    await commands.doctorCancel();
  },
  onProgress: callback =>
    subscribeChannel<DoctorProgress>(C.progress, events.doctorProgress, doctorProgress, callback),
};
