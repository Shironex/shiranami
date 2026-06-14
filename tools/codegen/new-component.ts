/**
 * Scaffolds the project's per-component 6-file convention:
 *
 *   pnpm new:component <feature>/<Name>
 *
 * Creates apps/web/src/components/<feature>/<Name>/ with a thin presentational
 * shell, its view hook, view types, a story, a test, and a barrel. The shell
 * stays dumb; state/queries/store-reads/IPC live in the hook.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const repoRoot = process.cwd();

function fail(message: string): never {
  console.error(`\n  error: ${message}\n`);
  process.exit(1);
}

/** `ScratchProbe` -> `scratch-probe`. */
function toKebab(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function assertPascalCase(name: string): void {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    fail(`component name must be PascalCase, e.g. "DownloadRow" (got "${name}")`);
  }
}

function assertKebabFeature(feature: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature)) {
    fail(`feature must be kebab-case, e.g. "downloads" (got "${feature}")`);
  }
}

/** Write a new file, creating parent dirs. Refuses to overwrite. */
function writeNew(relPath: string, contents: string): void {
  const abs = join(repoRoot, relPath);
  if (existsSync(abs)) {
    fail(`refusing to overwrite existing file: ${relPath}`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
  console.log(`  created  ${relPath}`);
}

function componentShell(name: string, kebab: string): string {
  return `import { cn } from '@/lib/utils';
import { use${name} } from './${name}.hooks';

export default function ${name}() {
  const { label } = use${name}();

  return (
    <div className={cn('flex flex-col gap-2')} data-slot="${kebab}">
      {label}
    </div>
  );
}
`;
}

function componentHooks(name: string): string {
  return `import type { I${name}View } from './${name}.types';

export function use${name}(): I${name}View {
  // TODO: own this component's state, queries, store reads, and IPC calls here
  // so the shell stays presentational.
  return { label: '${name}' };
}
`;
}

function componentTypes(name: string): string {
  return `export interface I${name}View {
  readonly label: string;
}

// export interface I${name}Props {
//   readonly variant: 'default' | 'compact';
// }
`;
}

function componentStories(name: string, feature: string): string {
  return `import type { Meta, StoryObj } from '@storybook/react-vite';

import ${name} from './${name}';

const meta: Meta<typeof ${name}> = {
  title: '${feature}/${name}',
  component: ${name},
};

export default meta;

type Story = StoryObj<typeof ${name}>;

export const Default: Story = {};
`;
}

function componentTest(name: string): string {
  return `import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ${name} from './${name}';

describe('${name}', () => {
  it('renders its label', () => {
    render(<${name} />);
    expect(screen.getByText('${name}')).toBeInTheDocument();
  });
});
`;
}

function componentBarrel(name: string): string {
  return `export { default as ${name} } from './${name}';
export * from './${name}.types';
`;
}

function main(): void {
  const arg = process.argv[2];
  if (arg === undefined || !arg.includes('/')) {
    fail('usage: pnpm new:component <feature>/<Name>   (e.g. downloads/DownloadRow)');
  }

  const slash = arg.indexOf('/');
  const feature = arg.slice(0, slash);
  const name = arg.slice(slash + 1);

  if (feature === '') fail('missing feature segment');
  if (name === '') fail('missing component name');

  assertKebabFeature(feature);
  assertPascalCase(name);

  const dir = `apps/web/src/components/${feature}/${name}`;
  if (existsSync(join(repoRoot, dir))) {
    fail(`component already exists: ${dir}`);
  }

  const kebab = toKebab(name);

  writeNew(`${dir}/${name}.tsx`, componentShell(name, kebab));
  writeNew(`${dir}/${name}.hooks.ts`, componentHooks(name));
  writeNew(`${dir}/${name}.types.ts`, componentTypes(name));
  writeNew(`${dir}/${name}.stories.tsx`, componentStories(name, feature));
  writeNew(`${dir}/${name}.test.tsx`, componentTest(name));
  writeNew(`${dir}/index.ts`, componentBarrel(name));

  console.log(`\n  ${name} scaffolded under components/${feature}. Render it from a parent.\n`);
}

main();
