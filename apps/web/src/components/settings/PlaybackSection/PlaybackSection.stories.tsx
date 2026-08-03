import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

import PlaybackSection from './PlaybackSection';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/**
 * settings · PlaybackSection. Playback preferences as toggle rows with live
 * previews: "Remember playback position", "Crossfade" (revealing a duration
 * slider when on), "Loudness leveling" (revealing a target slider + analyze
 * control when on), and an always-present sleep-timer fade-out slider. Toggles +
 * sliders live in `usePlaybackStore`; the remember-position flag comes from the
 * IPC-backed settings query (undefined → false in the browser).
 */
const meta: Meta<typeof PlaybackSection> = {
  title: 'settings/PlaybackSection',
  component: PlaybackSection,
  // a11y stays at the global 'todo' default: the crossfade-duration, loudness-
  // target, and sleep-fade Sliders are rendered without an accessible name (no
  // aria-label at the call site in PlaybackSection.tsx). The sleep-fade slider is
  // always mounted, so even the default story trips axe's aria-input-field-name
  // rule on its thumb. Naming them is a component-file change out of scope here.
  decorators: [
    Story => (
      <QueryClientProvider client={client}>
        <div className="max-w-[640px] p-4">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaybackSection>;

/** Default — the rows render; toggling Crossfade flips the store and reveals it. */
export const Default: Story = {
  decorators: [
    Story => {
      usePlaybackStore.setState({
        crossfadeEnabled: false,
        loudnessEnabled: false,
        sleepFadeDuration: 5,
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Playback' })).toBeInTheDocument();

    // The Crossfade switch is named and off; clicking it turns crossfade on.
    const crossfade = canvas.getByRole('switch', { name: 'Crossfade' });
    await expect(crossfade).not.toBeChecked();
    await userEvent.click(crossfade);
    await waitFor(() => expect(usePlaybackStore.getState().crossfadeEnabled).toBe(true));

    usePlaybackStore.setState({ crossfadeEnabled: false });
  },
};

/** Crossfade & loudness on — the duration/target sliders are revealed. */
export const CrossfadeAndLoudnessOn: Story = {
  decorators: [
    Story => {
      usePlaybackStore.setState({
        crossfadeEnabled: true,
        crossfadeDuration: 6,
        loudnessEnabled: true,
        loudnessTargetLufs: -14,
        sleepFadeDuration: 8,
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('switch', { name: 'Crossfade' })).toBeChecked();
    await expect(canvas.getByRole('switch', { name: 'Loudness leveling' })).toBeChecked();
    // Crossfade duration, loudness target, and sleep-fade sliders are all shown.
    await expect(canvas.getAllByRole('slider')).toHaveLength(3);
    // The F5 leveling-mode select rides the enabled block, defaulting to Track.
    const mode = canvas.getByRole('combobox', { name: 'Leveling mode' });
    await expect(mode).toHaveTextContent('Track');

    usePlaybackStore.setState({ crossfadeEnabled: false, loudnessEnabled: false });
  },
};
