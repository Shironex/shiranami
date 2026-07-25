import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';

import SearchSuggestions from './SearchSuggestions';

/**
 * search · SearchSuggestions. The autocomplete dropdown anchored under
 * SearchView's query input: a `role="listbox"` of `role="option"` rows, each a
 * magnifier glyph plus the suggestion text. The row matching `highlightedIndex`
 * carries `aria-selected` and the active tint; hovering a row reports its index
 * back through `setHighlightedIndex` so pointer and arrow-key navigation agree,
 * and mousedown commits the suggestion while suppressing its default so the
 * input never blurs mid-selection.
 *
 * a11y stays at `'todo'`: in the app this listbox is owned and named by the
 * search input it drops out of, but in isolation it has no labelling
 * combobox, so axe's `aria-input-field-name` flags the unnamed listbox. Naming
 * it here would change the component's accessibility contract, so the deferral
 * is intentional.
 */
const meta: Meta<typeof SearchSuggestions> = {
  title: 'search/SearchSuggestions',
  component: SearchSuggestions,
  parameters: {
    a11y: { test: 'todo' },
  },
  args: {
    suggestions: ['lofi beats', 'lofi hip hop radio', 'lofi study session'],
    highlightedIndex: -1,
    setHighlightedIndex: fn(),
    onSelect: fn(),
  },
  decorators: [
    Story => (
      <div className="relative h-64 w-[26rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SearchSuggestions>;

/** Nothing highlighted — hovering reports an index, clicking commits the row. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const options = canvas.getAllByRole('option');
    await expect(options).toHaveLength(3);
    for (const option of options) {
      await expect(option).toHaveAttribute('aria-selected', 'false');
    }

    await userEvent.hover(options[1]);
    await expect(args.setHighlightedIndex).toHaveBeenCalledWith(1);

    await userEvent.click(options[0]);
    await expect(args.onSelect).toHaveBeenCalledWith('lofi beats');
  },
};

/** Arrow-keyed to the second row — only it reports `aria-selected`. */
export const Highlighted: Story = {
  args: {
    highlightedIndex: 1,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const options = canvas.getAllByRole('option');
    await expect(options[0]).toHaveAttribute('aria-selected', 'false');
    await expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await expect(options[2]).toHaveAttribute('aria-selected', 'false');
  },
};

/** A single match — the dropdown collapses to one committable row. */
export const SingleSuggestion: Story = {
  args: {
    suggestions: ['lofi girl'],
    highlightedIndex: 0,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const option = canvas.getByRole('option');
    await expect(option).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(option);
    await expect(args.onSelect).toHaveBeenCalledWith('lofi girl');
  },
};

/** Overlong suggestions — each row truncates instead of wrapping the dropdown. */
export const TruncatedSuggestions: Story = {
  args: {
    suggestions: [
      'lofi hip hop radio beats to relax and study to 24/7 live stream',
      'rainy night jazz cafe ambience with distant thunder and vinyl crackle',
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('option')).toHaveLength(2);
    await expect(canvasElement.querySelectorAll('.truncate')).toHaveLength(2);
  },
};
