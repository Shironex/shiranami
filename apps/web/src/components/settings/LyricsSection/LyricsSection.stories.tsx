import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { lyricsPrefKeys } from '@/hooks/queries/useLyrics';
import {
  useLyricsAppearanceStore,
  LYRICS_PLAIN_OPACITY_DEFAULT,
  LYRICS_PLAIN_FONT_SIZE_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
  LYRICS_SYNCED_FONT_SIZE_DEFAULT,
  LYRICS_PRESENTATION_DEFAULT,
} from '@/stores/useLyricsAppearanceStore';
import { useUIStore } from '@/stores/useUIStore';

import LyricsSection from './LyricsSection';

/** Seed the source-preference query cache so the toggle renders a known state. */
function withSeededPreferSynced(value: boolean) {
  return function Decorator(Story: () => ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData<boolean>(lyricsPrefKeys.preferSynced, value);
    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  };
}

function seedDefaults(): void {
  useLyricsAppearanceStore.setState({
    lyricsPlainOpacity: LYRICS_PLAIN_OPACITY_DEFAULT,
    lyricsPlainFontSize: LYRICS_PLAIN_FONT_SIZE_DEFAULT,
    lyricsSyncedDimOpacity: LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
    lyricsSyncedFontSize: LYRICS_SYNCED_FONT_SIZE_DEFAULT,
    lyricsPresentation: LYRICS_PRESENTATION_DEFAULT,
  });
  useUIStore.setState({ nowPlayingViewEnabled: true });
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

/**
 * Sources — the LRCLIB source-preference toggle renders its seeded state. As in
 * SystemSection: in the Storybook browser run `IS_ELECTRON` is false (module
 * constant captured before the preview installs the electronAPI mock), so the
 * toggle stays `disabled` and this story asserts that gated contract; the
 * interactive optimistic flip is covered by LyricsSection.test.tsx under jsdom.
 */
export const Sources: Story = {
  decorators: [withSeededPreferSynced(false)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const toggle = canvas.getByRole('switch', { name: 'Prefer synced lyrics from LRCLIB' });
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeDisabled();
  },
};

/** Sources with the preference on — the seeded checked state renders. */
export const SourcesPreferSynced: Story = {
  decorators: [withSeededPreferSynced(true)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('switch', { name: 'Prefer synced lyrics from LRCLIB' })
    ).toBeChecked();
  },
};

/**
 * Focus selected while the Now Playing view is off — the info callout points
 * at the view that actually hosts the focus stage (observation, not a nag).
 */
export const FocusHint: Story = {
  decorators: [
    Story => {
      useLyricsAppearanceStore.setState({ lyricsPresentation: 'focus' });
      useUIStore.setState({ nowPlayingViewEnabled: false });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText(/appears in the Now Playing view/)).toBeInTheDocument();
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
