import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import {
  useLyricsAppearanceStore,
  LYRICS_PLAIN_OPACITY_DEFAULT,
  LYRICS_PLAIN_FONT_SIZE_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
  LYRICS_SYNCED_FONT_SIZE_DEFAULT,
} from '@/stores/useLyricsAppearanceStore';

import LyricsSection from './LyricsSection';

function seedDefaults(): void {
  useLyricsAppearanceStore.setState({
    lyricsPlainOpacity: LYRICS_PLAIN_OPACITY_DEFAULT,
    lyricsPlainFontSize: LYRICS_PLAIN_FONT_SIZE_DEFAULT,
    lyricsSyncedDimOpacity: LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
    lyricsSyncedFontSize: LYRICS_SYNCED_FONT_SIZE_DEFAULT,
  });
}

/**
 * settings · LyricsSection. Lyrics appearance: a "Plain text" subsection and a
 * "Synced lyrics" subsection, each with an opacity slider (accessibly named via
 * aria-label), a font-size `role="radiogroup"` of size chips (Small / Default /
 * Large / Extra large), and a live text preview. All four prefs live in
 * `useLyricsAppearanceStore`.
 */
const meta: Meta<typeof LyricsSection> = {
  title: 'settings/LyricsSection',
  component: LyricsSection,
  // Reset the appearance store to defaults before every story so a thrown
  // assertion (or a story that seeds custom values) can never leak state into a
  // later story. Stories that need custom values override these via a decorator,
  // which runs after this seed-on-entry reset.
  beforeEach: () => {
    seedDefaults();
  },
  // a11y stays at the global 'todo' default: the live previews render lyric text
  // at an intentionally reduced opacity (dim/synced-past lines), which makes the
  // foreground/background contrast non-deterministic for axe's color-contrast
  // rule depending on the seeded opacity. The opacity sliders and size radios
  // ARE properly named (aria-label / radiogroup), so the deferral is purely the
  // dimmed preview text — mirrors the SplashScreen timed-fade deferral.
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LyricsSection>;

/** Default — both subsections render; the plain-text size chip drives the store. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Lyrics' })).toBeInTheDocument();

    // Each subsection has its own opacity slider (named) and a font-size
    // radiogroup; both subsections share the "Font size" group name, so index
    // the first (plain text).
    await expect(canvas.getAllByRole('slider')).toHaveLength(2);
    const [plainSizeGroup] = canvas.getAllByRole('radiogroup', { name: 'Font size' });

    // Clicking the "Large" chip writes 'lg' to the plain-text font size — query
    // it by its accessible name rather than array position.
    await userEvent.click(within(plainSizeGroup).getByRole('radio', { name: 'Large' }));
    await waitFor(() => expect(useLyricsAppearanceStore.getState().lyricsPlainFontSize).toBe('lg'));
  },
};

/** Customized — non-default opacity + sizes mark the matching size chips active. */
export const Customized: Story = {
  decorators: [
    Story => {
      useLyricsAppearanceStore.setState({
        lyricsPlainOpacity: 0.7,
        lyricsPlainFontSize: 'lg',
        lyricsSyncedDimOpacity: 0.3,
        lyricsSyncedFontSize: 'xl',
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const [plainSizeGroup] = canvas.getAllByRole('radiogroup', { name: 'Font size' });
    await expect(within(plainSizeGroup).getByRole('radio', { name: 'Large' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  },
};
