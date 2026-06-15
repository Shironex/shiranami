import type { Meta, StoryObj } from '@storybook/react-vite';
import { Globe } from 'lucide-react';
import { screen, within, userEvent, expect, waitFor } from 'storybook/test';
import type { IFilterOption } from './FilterPopover.types';

import FilterPopover from './FilterPopover';

const countries: IFilterOption[] = [
  { value: 'US', label: 'United States', prefix: '🇺🇸', count: 18234 },
  { value: 'GB', label: 'United Kingdom', prefix: '🇬🇧', count: 4210 },
  { value: 'JP', label: 'Japan', prefix: '🇯🇵', count: 980 },
  { value: 'PL', label: 'Poland', prefix: '🇵🇱', count: 312 },
];

/**
 * radio · FilterPopover. A compact filter trigger that opens a searchable
 * command list of options (flag prefix · label · count). The trigger button is
 * named by its `label` and shows the selected option (or the placeholder);
 * picking an option calls `onSelect` and closes the popover, and re-picking the
 * active option clears it. The list portals out of the trigger, so stories query
 * it via `screen`. The trigger is disabled when `disabled` is set.
 */
const meta: Meta<typeof FilterPopover> = {
  title: 'radio/FilterPopover',
  component: FilterPopover,
  parameters: {
    // The trigger button carries an aria-label, the search input has its
    // placeholder, and the options expose option roles — axe passes clean.
    a11y: { test: 'error' },
  },
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

/** Unselected — opening the popover reveals the searchable option list. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The trigger is named by its label and shows the placeholder when empty.
    const trigger = canvas.getByRole('button', { name: 'Country' });
    await expect(trigger).toHaveTextContent('All countries');

    // The list portals out of the canvas, so query the opened options via screen.
    await userEvent.click(trigger);
    await expect(await screen.findByText('United States')).toBeInTheDocument();
    await expect(screen.getByText('Japan')).toBeInTheDocument();

    // Picking an option closes the popover, unmounting the option list.
    await userEvent.click(screen.getByText('United States'));
    await waitFor(() => expect(screen.queryByText('Japan')).not.toBeInTheDocument());
  },
};

/** Selected — the trigger shows the chosen option's flag + label. */
export const Selected: Story = {
  args: {
    value: 'GB',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Country' })).toHaveTextContent(
      'United Kingdom'
    );
  },
};

/** Disabled — the trigger can't be opened (e.g. before options have loaded). */
export const Disabled: Story = {
  args: {
    options: [],
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Country' })).toBeDisabled();
  },
};
