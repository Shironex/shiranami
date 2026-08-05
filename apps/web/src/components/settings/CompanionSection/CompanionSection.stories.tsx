import type { Meta, StoryObj } from '@storybook/react-vite';

import CompanionSection from './CompanionSection';

const meta: Meta<typeof CompanionSection> = {
  title: 'settings/CompanionSection',
  component: CompanionSection,
};

export default meta;

type Story = StoryObj<typeof CompanionSection>;

export const Default: Story = {};
