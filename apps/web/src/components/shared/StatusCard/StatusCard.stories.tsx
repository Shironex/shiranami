import type { Meta, StoryObj } from '@storybook/react-vite';
import { Search } from 'lucide-react';

import StatusCard from './StatusCard';

/**
 * shared · StatusCard. The centered mascot status card behind SearchStateCard
 * and the inline searching/error cards in SearchView + RadioView. Renders a
 * mascot with an optional icon badge (or a spinner while `loading`), a title,
 * an optional description, and optional children. `variant="destructive"` tints
 * the frame red. Presentational — props in, card out.
 */
const meta: Meta<typeof StatusCard> = {
  title: 'shared/StatusCard',
  component: StatusCard,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'No results',
    description: 'Try a different search term.',
    badgeIcon: Search,
  },
};

export const Loading: Story = {
  args: {
    title: 'Searching…',
    description: 'Looking for matching tracks.',
    loading: true,
  },
};
