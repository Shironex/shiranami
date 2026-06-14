import { propsMustBeVisualRule } from '../../src/rules/props-must-be-visual';
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
  ],
});
