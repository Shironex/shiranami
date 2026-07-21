import type { Meta, StoryObj } from '@storybook/react-vite';
import { motion } from 'motion/react';
import { STAGGER_ITEM } from '@/lib/motion';
import StaggerList from './StaggerList';

/**
 * shared · StaggerList. Wraps a list so its children cascade in via the shared
 * `STAGGER_CONTAINER`, or renders a plain div under reduced motion. Children
 * carry their own `STAGGER_ITEM` variants — the wrapper only owns the container.
 */
const meta: Meta<typeof StaggerList> = {
  title: 'shared/StaggerList',
  component: StaggerList,
};

export default meta;

type Story = StoryObj<typeof meta>;

const rows = ['Lo-fi rain', 'Midnight study', 'Slow train', 'Quiet cafe'].map(label => (
  <motion.div
    key={label}
    variants={STAGGER_ITEM}
    className="rounded-xl border border-border/30 bg-muted/30 px-4 py-3 text-sm"
  >
    {label}
  </motion.div>
));

export const Default: Story = {
  args: {
    className: 'space-y-2 w-72',
    children: rows,
  },
};
