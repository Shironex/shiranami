import { noCrossFeatureImportsRule } from '../../src/rules/no-cross-feature-imports';
import { ruleTester } from '../test-utils/ruleTester';

const FROM = 'apps/web/src/components/downloads/DownloadsView/DownloadsView.tsx';

ruleTester.run('no-cross-feature-imports', noCrossFeatureImportsRule, {
  valid: [
    // Same feature via alias.
    {
      code: `import { x } from '@/components/downloads/DownloadRow';`,
      filename: FROM,
    },
    // Same feature via relative path.
    {
      code: `import { DownloadRow } from '../DownloadRow/DownloadRow';`,
      filename: FROM,
    },
    // Shared feature is importable by all.
    {
      code: `import { EmptyState } from '@/components/shared/EmptyState';`,
      filename: FROM,
    },
    // Type-only cross-feature import is allowed by default.
    {
      code: `import type { LibraryItem } from '@/components/library/LibraryView/LibraryView.types';`,
      filename: FROM,
    },
    // Non-feature imports (lib, stores, hooks, workspace) are fine.
    {
      code: `import { cn } from '@/lib/utils';`,
      filename: FROM,
    },
    {
      code: `import { usePlayerStore } from '@/stores/player';`,
      filename: FROM,
    },
    {
      code: `import { rules } from '@shiranami/eslint-plugin';`,
      filename: FROM,
    },
    // Files outside any feature are not constrained.
    {
      code: `import { LibraryView } from '@/components/library/LibraryView';`,
      filename: 'apps/web/src/routes/library.tsx',
    },
  ],
  invalid: [
    // Runtime cross-feature import via alias.
    {
      code: `import { LibraryView } from '@/components/library/LibraryView';`,
      filename: FROM,
      errors: [{ messageId: 'crossFeatureImport' }],
    },
    // Runtime cross-feature import via relative path.
    {
      code: `import { LibraryView } from '../../library/LibraryView/LibraryView';`,
      filename: FROM,
      errors: [{ messageId: 'crossFeatureImport' }],
    },
    // Type-only import disallowed once allowTypeImports is off.
    {
      code: `import type { LibraryItem } from '@/components/library/LibraryView/LibraryView.types';`,
      filename: FROM,
      options: [{ allowTypeImports: false }],
      errors: [{ messageId: 'crossFeatureImport' }],
    },
  ],
});
