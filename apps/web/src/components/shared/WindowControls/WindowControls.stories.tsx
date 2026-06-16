import type { Meta, StoryObj } from '@storybook/react-vite';

import WindowControls from './WindowControls';

/**
 * shared · WindowControls. The Windows-only minimize / maximize / close cluster
 * for the frameless window. It renders nothing on macOS (native traffic lights)
 * or in the browser, so in the Storybook run — where `IS_ELECTRON` is false — it
 * intentionally mounts to an empty fragment without throwing.
 */
const meta: Meta<typeof WindowControls> = {
  title: 'shared/WindowControls',
  component: WindowControls,
};

export default meta;

type Story = StoryObj<typeof WindowControls>;

export const Default: Story = {
  args: { className: 'pr-1.5' },
};
