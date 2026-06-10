import { invoke } from '../context-bridge';
import { IPC_CHANNELS } from '@shiranami/contracts';
import type { StoreSchema } from '../../store';

const C = IPC_CHANNELS.store;

export interface StoreApi {
  get: <K extends keyof StoreSchema>(key: K) => Promise<StoreSchema[K] | undefined>;
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => Promise<void>;
  delete: <K extends keyof StoreSchema>(key: K) => Promise<void>;
}

export const storeApi: StoreApi = {
  get: <K extends keyof StoreSchema>(key: K) =>
    invoke(C.get, key) as Promise<StoreSchema[K] | undefined>,
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => invoke(C.set, key, value),
  delete: <K extends keyof StoreSchema>(key: K) => invoke(C.delete, key),
};
