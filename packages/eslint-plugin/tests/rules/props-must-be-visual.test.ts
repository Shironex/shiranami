import { describe, expect, it } from 'vitest';

import { compileDenyPatterns, propsMustBeVisualRule } from '../../src/rules/props-must-be-visual';
import { ruleTester } from '../test-utils/ruleTester';

const FILE = 'apps/web/src/components/auth/LoginForm.tsx';

ruleTester.run('props-must-be-visual', propsMustBeVisualRule, {
  valid: [
    // Visual props.
    {
      code: `interface LoginFormProps { label: string; disabled?: boolean; }`,
      filename: FILE,
    },
    // Non-Props interface is not a props surface.
    {
      code: `interface AuthState { userId: string; token: string; }`,
      filename: FILE,
    },
    // Non-component files are not checked.
    {
      code: `interface ThingProps { token: string; }`,
      filename: 'apps/web/src/lib/auth-types.ts',
    },
    // Visual props expressed as a type-alias object literal.
    {
      code: `type LoginFormProps = { label: string; disabled?: boolean; };`,
      filename: FILE,
    },
    // A non-Props type alias is not a props surface.
    {
      code: `type AuthState = { userId: string; token: string; };`,
      filename: FILE,
    },
  ],
  invalid: [
    {
      code: `interface LoginFormProps { userId: string; }`,
      filename: FILE,
      errors: [{ messageId: 'nonVisualProp' }],
    },
    {
      code: `interface LoginFormProps { resetToken: string; }`,
      filename: FILE,
      errors: [{ messageId: 'nonVisualProp' }],
    },
    {
      code: `interface LoginFormProps { currentUser: unknown; }`,
      filename: FILE,
      errors: [{ messageId: 'nonVisualProp' }],
    },
    // Type-alias object-literal props are checked just like interfaces.
    {
      code: `type LoginFormProps = { userId: string; };`,
      filename: FILE,
      errors: [{ messageId: 'nonVisualProp' }],
    },
    {
      code: `type LoginFormProps = { resetToken: string; };`,
      filename: FILE,
      errors: [{ messageId: 'nonVisualProp' }],
    },
  ],
});

describe('compileDenyPatterns', () => {
  it('compiles valid patterns', () => {
    const patterns = compileDenyPatterns(['^userId$', 'token']);
    expect(patterns).toHaveLength(2);
    expect(patterns[0]?.test('userId')).toBe(true);
  });

  it('throws an actionable error naming the malformed pattern', () => {
    expect(() => compileDenyPatterns(['^valid$', '(['])).toThrow(/\(\[/);
    expect(() => compileDenyPatterns(['(['])).toThrow(/Invalid `denyPatterns` entry/);
  });
});
