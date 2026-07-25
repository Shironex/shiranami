import { componentFolderStructureRule } from '../../src/rules/component-folder-structure';
import { fixture, ruleTester } from '../test-utils/ruleTester';

const COMPONENT = `export default function Widget() { return null; }`;

// The fixtures under tests/fixtures/components/** carry the sibling sets these
// cases assert on; `fixture()` anchors them so the runner's cwd cannot matter.
ruleTester.run('component-folder-structure', componentFolderStructureRule, {
  valid: [
    // A component folder whose full sibling set is present on disk.
    {
      code: COMPONENT,
      filename: fixture('components/downloads/Complete/Complete.tsx'),
    },
    // Kebab-case file is not a component entry file — skipped.
    {
      code: COMPONENT,
      filename: 'apps/web/src/components/downloads/activity-feed.tsx',
    },
    // Basename does not equal parent folder — not a component entry file.
    {
      code: COMPONENT,
      filename: 'apps/web/src/components/downloads/Group/Widget.tsx',
    },
    // components/ui keeps the shadcn convention — excluded via ignorePaths.
    {
      code: COMPONENT,
      filename: 'apps/web/src/components/ui/Button/Button.tsx',
    },
    // A component file outside components/** is not gated.
    {
      code: COMPONENT,
      filename: 'apps/web/src/routes/Widget/Widget.tsx',
    },
  ],
  invalid: [
    // A component folder on disk that is missing its entire sibling set.
    {
      code: COMPONENT,
      filename: fixture('components/downloads/Widget/Widget.tsx'),
      errors: [{ messageId: 'missingSiblings' }],
    },
  ],
});
