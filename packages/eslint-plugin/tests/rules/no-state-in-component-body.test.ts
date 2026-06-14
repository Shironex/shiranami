import { noStateInComponentBodyRule } from '../../src/rules/no-state-in-component-body';
import { ruleTester } from '../test-utils/ruleTester';

const COMPONENT = 'apps/web/src/components/downloads/DownloadsView/DownloadsView.tsx';
const HOOK = 'apps/web/src/components/downloads/DownloadsView/DownloadsView.hooks.ts';

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
  ],
});
