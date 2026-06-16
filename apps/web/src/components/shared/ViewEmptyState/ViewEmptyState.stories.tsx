import type { Meta, StoryObj } from '@storybook/react-vite';
import { Search } from 'lucide-react';

import ViewEmptyState from './ViewEmptyState';

/**
 * shared · ViewEmptyState. The full-bleed empty/error state used across views —
 * a floating mascot with a contextual icon badge, a title + subtitle, optional
 * hint chips, and an optional call-to-action. `variant="error"` tints the frame
 * red; `compact` swaps in a lighter inline layout. Presentational — props in,
 * panel out.
 */
const meta: Meta<typeof ViewEmptyState> = {
  title: 'shared/ViewEmptyState',
  component: ViewEmptyState,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Nothing here yet',
    subtitle: 'Search for a track to get started.',
    icon: Search,
  },
};
