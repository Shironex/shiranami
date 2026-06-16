import type { Meta, StoryObj } from '@storybook/react-vite';
import { Library } from 'lucide-react';

import PageHeader from './PageHeader';

/**
 * shared · PageHeader. The heading row at the top of a view. The `page` variant
 * renders a large top-level `<h1>` title; the `section` variant renders a
 * decorative icon tile beside an `<h2>` with an optional uppercase subtitle.
 * Presentational — props in, header out.
 */
const meta: Meta<typeof PageHeader> = {
  title: 'shared/PageHeader',
  component: PageHeader,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Page: Story = {
  args: {
    title: 'Library',
  },
};

export const Section: Story = {
  args: {
    variant: 'section',
    icon: Library,
    title: 'Albums',
    subtitle: '24 albums',
  },
};
