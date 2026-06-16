import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import MetadataEnrichSection from './MetadataEnrichSection';

/** Reset the library + enrich run state to a clean, idle baseline. */
function seed(): void {
  useLibraryStore.setState({ library: [] });
  useMetadataEnrichStore.setState({
    isEnriching: false,
    isCancelling: false,
    skippedIds: new Set(),
    skippedLoaded: true,
    lastRunResults: [],
    progress: null,
  });
}

/**
 * settings · MetadataEnrichSection. The bulk metadata-enrichment panel: a static
 * before/after preview, a stats line counting tracks with missing tags, an
 * "Only fill missing fields" toggle, the run button (gated behind an inline
 * confirm when writing tags to disk), and a separate "Write tags to audio files"
 * opt-in.
 *
 * The entire section is gated by `if (!isElectron) return null`, where
 * `isElectron` is the `IS_ELECTRON` module-constant from `@/lib/platform`. In the
 * Storybook browser run that constant resolves to `false` — platform.ts is
 * imported before the preview installs the electronAPI mock — so the section
 * renders nothing here. The loaded panel (heading, stats line, run button,
 * toggles) is therefore unreachable in-browser, and the story asserts the
 * render-null contract: none of the gated UI is present.
 */
const meta: Meta<typeof MetadataEnrichSection> = {
  title: 'settings/MetadataEnrichSection',
  component: MetadataEnrichSection,
  parameters: {
    // Outside Electron the section renders nothing, so there are no roles to
    // audit — axe passes trivially clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="max-w-[680px] p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MetadataEnrichSection>;

/**
 * Gated outside Electron — the whole section returns null, so none of its
 * heading, stats line, run button, or toggles render.
 */
export const GatedOutsideElectron: Story = {
  decorators: [
    Story => {
      seed();
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // `if (!isElectron) return null` — no card heading, stats text, run button,
    // or option toggles are reachable in the browser run.
    await expect(
      canvas.queryByRole('heading', { name: /Find Missing Metadata/ })
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText('No tracks with missing metadata found')
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Find Missing Metadata' })
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('switch', { name: 'Only fill missing fields' })
    ).not.toBeInTheDocument();
  },
};
