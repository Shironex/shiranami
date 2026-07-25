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
    // A sidecar is not a component file — only the `.tsx` entry is gated.
    {
      code: COMPONENT,
      filename: 'apps/web/src/components/downloads/Group/Group.stories.tsx',
    },
    // components/ui keeps the shadcn convention — excluded via ignorePaths.
    {
      code: COMPONENT,
      filename: 'apps/web/src/components/ui/Button/Button.tsx',
    },
    // The 15 shadcn primitives are loose files under components/ui by design;
    // the widened nested check must keep skipping them.
    {
      code: COMPONENT,
      filename: 'apps/web/src/components/ui/Button.tsx',
    },
    {
      code: COMPONENT,
      filename: 'apps/web/src/components/ui/IconButton.tsx',
    },
    // ignorePaths is honoured for the nested case, not just the entry case.
    {
      code: COMPONENT,
      filename: 'apps/web/src/components/splash/SplashRain.tsx',
      options: [{ ignorePaths: ['**/components/splash/**'] }],
    },
    // A component file outside components/** is not gated.
    {
      code: COMPONENT,
      filename: 'apps/web/src/routes/Widget/Widget.tsx',
    },
    {
      code: COMPONENT,
      filename: 'apps/web/src/routes/Widget/Panel.tsx',
    },
  ],
  invalid: [
    // A component folder on disk that is missing its entire sibling set.
    {
      code: COMPONENT,
      filename: fixture('components/downloads/Widget/Widget.tsx'),
      errors: [{ messageId: 'missingSiblings' }],
    },
    // A sub-component colocated inside another component's folder — the folder
    // itself is complete on disk, so only the misplaced file is reported.
    {
      code: COMPONENT,
      filename: fixture('components/downloads/Complete/Extra.tsx'),
      errors: [
        {
          messageId: 'notInOwnFolder',
          data: {
            name: 'Extra',
            required: 'Extra.hooks.ts, Extra.types.ts, Extra.stories.tsx, Extra.test.tsx, index.ts',
          },
        },
      ],
    },
    // Basename does not equal parent folder — a nested sub-component.
    {
      code: COMPONENT,
      filename: 'apps/web/src/components/downloads/Group/Widget.tsx',
      errors: [{ messageId: 'notInOwnFolder' }],
    },
    // A loose component at a feature root (the pre-migration `splash/` shape).
    {
      code: COMPONENT,
      filename: 'apps/web/src/components/splash/SplashRain.tsx',
      errors: [{ messageId: 'notInOwnFolder' }],
    },
    // A loose component in a nested feature sub-directory.
    {
      code: COMPONENT,
      filename: 'apps/web/src/components/onboarding/steps/WelcomeStep.tsx',
      errors: [{ messageId: 'notInOwnFolder' }],
    },
  ],
});
