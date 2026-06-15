import type { Meta, StoryObj } from '@storybook/react-vite';
import { Globe } from 'lucide-react';
import type { IFilterOption } from './FilterPopover.types';

import FilterPopover from './FilterPopover';

const countries: IFilterOption[] = [
  { value: 'US', label: 'United States', prefix: '🇺🇸', count: 18234 },
  { value: 'GB', label: 'United Kingdom', prefix: '🇬🇧', count: 4210 },
  { value: 'JP', label: 'Japan', prefix: '🇯🇵', count: 980 },
  { value: 'PL', label: 'Poland', prefix: '🇵🇱', count: 312 },
];

const meta: Meta<typeof FilterPopover> = {
  title: 'radio/FilterPopover',
  component: FilterPopover,
  args: {
    label: 'Country',
    placeholder: 'All countries',
    searchPlaceholder: 'Search countries…',
    emptyText: 'No countries found',
    options: countries,
    value: null,
    onSelect: () => {},
    icon: <Globe className="w-3.5 h-3.5 shrink-0 opacity-70" />,
  },
  decorators: [
    Story => (
      <div className="flex items-center p-8">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof FilterPopover>;

export const Default: Story = {};

export const Selected: Story = {
  args: {
    value: 'GB',
  },
};

export const Disabled: Story = {
  args: {
    options: [],
    disabled: true,
  },
};
