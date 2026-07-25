import { noStateInComponentBodyRule } from '../../src/rules/no-state-in-component-body';
import { ruleTester } from '../test-utils/ruleTester';

const COMPONENT = 'apps/web/src/components/downloads/DownloadsView/DownloadsView.tsx';
const HOOK = 'apps/web/src/components/downloads/DownloadsView/DownloadsView.hooks.ts';
// A sub-component colocated in another component's folder, and a loose file at
// a feature root: components that are not entry shells.
const NESTED = 'apps/web/src/components/downloads/DownloadsView/DownloadRow.tsx';
const FEATURE_ROOT = 'apps/web/src/components/splash/SplashRain.tsx';

ruleTester.run('no-state-in-component-body', noStateInComponentBodyRule, {
  valid: [
    // Render-safe hooks are allowlisted.
    {
      code: `import { useId } from 'react';\nexport default function DownloadsView() { const id = useId(); return null; }`,
      filename: COMPONENT,
    },
    // Non-flagged custom presentational hooks are fine in the shell.
    {
      code: `export default function DownloadsView({ view }: { view: unknown }) { return null; }`,
      filename: COMPONENT,
    },
    // useTransition / useDeferredValue are render-safe.
    {
      code: `import { useTransition } from 'react';\nexport default function DownloadsView() { const [p] = useTransition(); return null; }`,
      filename: COMPONENT,
    },
    // The same hook is the correct home in a .hooks.ts file.
    {
      code: `import { useState } from 'react';\nexport function useDownloadsView() { return useState(0); }`,
      filename: HOOK,
    },
    // Stateful hooks in a non-component file are not gated.
    {
      code: `import { useState } from 'react';\nexport function useThing() { return useState(0); }`,
      filename: 'apps/web/src/hooks/use-thing.ts',
    },
    // Nested components are only checked when opted in.
    {
      code: `import { useState } from 'react';\nexport function DownloadRow() { const [n] = useState(0); return null; }`,
      filename: NESTED,
    },
    {
      code: `import { useState } from 'react';\nexport function SplashRain() { const [n] = useState(0); return null; }`,
      filename: FEATURE_ROOT,
    },
    // A component-shaped file outside `components/` is not a nested component.
    {
      code: `import { useState } from 'react';\nexport default function App() { const [n] = useState(0); return null; }`,
      filename: 'apps/web/src/App.tsx',
      options: [{ includeNestedComponents: true }],
    },
    // Sidecars keep their own conventions under the widened check.
    {
      code: `import { useState } from 'react';\nexport function useDownloadsView() { return useState(0); }`,
      filename: HOOK,
      options: [{ includeNestedComponents: true }],
    },
  ],
  invalid: [
    {
      code: `import { useState } from 'react';\nexport default function DownloadsView() { const [n] = useState(0); return null; }`,
      filename: COMPONENT,
      errors: [{ messageId: 'stateInBody' }],
    },
    {
      code: `import { useEffect } from 'react';\nexport default function DownloadsView() { useEffect(() => {}, []); return null; }`,
      filename: COMPONENT,
      errors: [{ messageId: 'stateInBody' }],
    },
    {
      code: `export default function DownloadsView() { const q = useQuery({}); return null; }`,
      filename: COMPONENT,
      errors: [{ messageId: 'stateInBody' }],
    },
    // Zustand store hook (use*Store) read in the body.
    {
      code: `export default function DownloadsView() { const s = usePlayerStore((x) => x); return null; }`,
      filename: COMPONENT,
      errors: [{ messageId: 'stateInBody' }],
    },
    // additionalHooks extends the flagged set.
    {
      code: `export default function DownloadsView() { const t = useIpc(); return null; }`,
      filename: COMPONENT,
      options: [{ additionalHooks: ['useIpc'] }],
      errors: [{ messageId: 'stateInBody' }],
    },
    // includeNestedComponents reaches a sub-component inside a component folder.
    {
      code: `import { useState } from 'react';\nexport function DownloadRow() { const [n] = useState(0); return null; }`,
      filename: NESTED,
      options: [{ includeNestedComponents: true }],
      errors: [{ messageId: 'stateInBody' }],
    },
    // ...and a loose component at a feature root.
    {
      code: `export function SplashRain() { const s = useSplashStore((x) => x); return null; }`,
      filename: FEATURE_ROOT,
      options: [{ includeNestedComponents: true }],
      errors: [{ messageId: 'stateInBody' }],
    },
  ],
});
