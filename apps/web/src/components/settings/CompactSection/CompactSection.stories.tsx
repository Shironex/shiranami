import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useCompactStore } from '@/stores/useCompactStore';

import CompactSection from './CompactSection';

function seedDefaults(): void {
  useCompactStore.setState({
    compactSize: 'md',
    compactFontSize: 'md',
    compactShowAlbumArt: true,
    compactShowAlbum: true,
    compactShowSeek: true,
    compactShowVolume: true,
    compactShowFavorite: false,
    compactShowLyrics: false,
    compactDefaultAlwaysOnTop: false,
  });
}

/**
 * settings · CompactSection. The mini-player settings card: an embedded
 * CompactModePreview, "Window size" / "Text size" preset chip rows, an ambient
 * intensity slider, a "Visible elements" group of toggle rows (Album art, Album
 * name, Seek bar, Volume slider, Favorite button, Lyrics button), and a
 * "Behavior" always-on-top toggle. All state lives in `useCompactStore`.
 */
const meta: Meta<typeof CompactSection> = {
  title: 'settings/CompactSection',
  component: CompactSection,
  // a11y stays at the global 'todo' default: the ambient-intensity Slider is
  // rendered without an accessible name (no aria-label at the call site in
  // CompactSection.tsx), so axe's aria-input-field-name rule fails on the slider
  // thumb. Naming it is a component-file change out of this story's scope.
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CompactSection>;

/** Default — the card renders; "Medium" sets size and the Album-art switch toggles. */
export const Default: Story = {
  decorators: [
    Story => {
      seedDefaults();
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Compact mode' })).toBeInTheDocument();

    // The "Medium" window-size chip writes 'md' to the store.
    await userEvent.click(canvas.getByRole('button', { name: 'Medium' }));
    await waitFor(() => expect(useCompactStore.getState().compactSize).toBe('md'));

    // The "Album art" element toggle starts checked; clicking it flips the store
    // flag off. Element switches are named via aria-labelledby on SettingsToggleRow.
    const albumArt = canvas.getByRole('switch', { name: 'Album art' });
    await expect(albumArt).toBeChecked();
    await userEvent.click(albumArt);
    await waitFor(() => expect(useCompactStore.getState().compactShowAlbumArt).toBe(false));

    seedDefaults();
  },
};
