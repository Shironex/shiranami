import { fixture, ruleTester } from '../test-utils/ruleTester';
import { indexMustReexportDefaultRule } from '../../src/rules/index-must-reexport-default';

// The Card/ fixture has a Card.tsx sibling on disk, so the rule activates for
// its index.ts (it only checks index.ts files next to a `<Folder>.tsx`).
const CARD_INDEX = fixture('components/Card/index.ts');

ruleTester.run('index-must-reexport-default', indexMustReexportDefaultRule, {
  valid: [
    {
      code: `export { default as Card } from './Card';`,
      filename: CARD_INDEX,
    },
    {
      code: `export { default } from './Card';\nexport * from './Card.types';`,
      filename: CARD_INDEX,
    },
    // A non-component-folder index.ts (no sibling PascalCase .tsx) is untouched.
    {
      code: `export const config = 1;`,
      filename: fixture('lib/index.ts'),
    },
    // An index.ts with no `<Folder>.tsx` sibling on disk is not a component
    // barrel and is left untouched.
    {
      code: `export * from './Card.types';`,
      filename: 'apps/web/src/components/downloads/NoSibling/index.ts',
    },
  ],
  invalid: [
    {
      code: `export * from './Card.types';`,
      filename: CARD_INDEX,
      errors: [{ messageId: 'missingDefaultReexport' }],
    },
  ],
});
