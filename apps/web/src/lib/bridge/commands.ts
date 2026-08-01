/**
 * The generated command surface, with D9 rehydration applied once.
 *
 * Every namespace module imports `commands` from here rather than from
 * `@shiranami/contracts/bindings`, so there is no way to reach a raw generated
 * callable from the shim and accidentally leak an un-rehydrated rejection.
 */

import { commands as generated } from '@shiranami/contracts/bindings';
import { withRehydratedRejections } from './errors';

export const commands = withRehydratedRejections(generated);
