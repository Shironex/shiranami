import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { useInterfaceStore, INTERFACE_DEFAULTS } from '@/stores/useInterfaceStore';

import PlayerBarPreview from './PlayerBarPreview';

/** Every collapsible mock element shares this frame. */
const ELEMENT = '.overflow-hidden.rounded-md';
/** The waveform seek strip is the only `gap-px` row. */
const WAVE_STRIP = '.gap-px';

/**
 * settings · PlayerBarPreview. A scaled mock of the player bar shown in the
 * Interface settings section. It reads the live `useInterfaceStore`: hidden
 * elements fold to zero width (max-width + opacity) instead of popping out, the
 * seek surface swaps between the waveform strip and a plain progress bar, and
 * `highlightedKey` rings whichever element the hovered settings row controls.
 * Transport controls and the seek row are unconditional, matching the real bar.
 */
const meta: Meta<typeof PlayerBarPreview> = {
  title: 'settings/PlayerBarPreview',
  component: PlayerBarPreview,
  parameters: {
    // A single labelled role="img" over decorative skeleton blocks and icons —
    // axe clean.
    a11y: { test: 'error' },
  },
  beforeEach: () => {
    useInterfaceStore.setState({ ...INTERFACE_DEFAULTS });
  },
  decorators: [
    Story => (
      <div className="max-w-[560px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlayerBarPreview>;

/** Shipping defaults — all eleven optional elements plus the waveform seekbar. */
export const AllElements: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Player bar preview' })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll(ELEMENT)).toHaveLength(11);
    await expect(canvasElement.querySelector(WAVE_STRIP)?.children).toHaveLength(24);
  },
};

/** Waveform seekbar off — the seek surface falls back to a plain progress bar. */
export const PlainSeekbar: Story = {
  beforeEach: () => {
    useInterfaceStore.setState({ ...INTERFACE_DEFAULTS, playerWaveformSeekbar: false });
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(WAVE_STRIP)).toBeNull();
    await expect(canvasElement.querySelector('.bg-primary\\/55')).not.toBeNull();
  },
};

/** Album art and volume hidden — both fold away, everything else stays put. */
export const ElementsHidden: Story = {
  beforeEach: () => {
    useInterfaceStore.setState({
      ...INTERFACE_DEFAULTS,
      playerAlbumArt: false,
      playerVolume: false,
    });
  },
  play: async ({ canvasElement }) => {
    const elements = canvasElement.querySelectorAll(ELEMENT);
    await expect(elements[0]).toHaveClass('max-w-0', 'opacity-0');
    await expect(elements[elements.length - 1]).toHaveClass('max-w-0', 'opacity-0');
    await expect(elements[1]).toHaveClass('opacity-100');
  },
};

/** Hovering the "Waveform seekbar" settings row rings the seek strip itself. */
export const SpotlightedElement: Story = {
  args: { highlightedKey: 'playerWaveformSeekbar' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(WAVE_STRIP)).toHaveClass('ring-1', 'bg-primary/10');
    await expect(canvasElement.querySelectorAll('.ring-1')).toHaveLength(1);
  },
};
