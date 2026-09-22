import type { Meta, StoryObj } from '@storybook/react-vite';
import { Library, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

/** Trailing action controls (e.g. a create button) via the `actions` slot. */
export const SectionWithActions: Story = {
  args: {
    variant: 'section',
    icon: Library,
    title: 'Albums',
    subtitle: '24 albums',
    actions: (
      <Button size="sm" className="gap-1.5">
        <Plus className="size-4" />
        New album
      </Button>
    ),
  },
};
