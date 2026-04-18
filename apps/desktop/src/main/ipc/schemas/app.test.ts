import { describe, it, expect } from 'vitest';
import { appGetVersionArgs, appOpenLogsFolderArgs } from './app';

describe('app payload schemas', () => {
  it('accept zero args', () => {
    expect(appGetVersionArgs.safeParse([]).success).toBe(true);
    expect(appOpenLogsFolderArgs.safeParse([]).success).toBe(true);
  });

  it('reject extra args', () => {
    expect(appGetVersionArgs.safeParse(['x']).success).toBe(false);
  });
});
