import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
import {
  backgroundLibraryKeys,
  type IBackgroundLibraryView,
} from '@/hooks/queries/useBackgroundLibrary';
import {
  useBackgroundSelectionStore,
  type BackgroundSelectionMode,
} from '@/stores/useBackgroundSelectionStore';
import type { BackgroundLibraryEntry } from '@shiranami/contracts/bindings';

import BackgroundLibraryManager from './BackgroundLibraryManager';

/**
 * settings · BackgroundLibraryManager. The saved-background manager inside the
 * Theme card: a tile grid with add/rename/remove, plus the selection-mode
 * controls (the user's pick, a rotation, or a time-of-day schedule sharing the
 * room-light stops). The stories seed the query cache directly — the loopback
 * origin is only set inside the webview, so the thumbnails name a placeholder
 * origin that will not load; what they demonstrate is the management surface.
 */
const meta: Meta<typeof BackgroundLibraryManager> = {
  title: 'settings/BackgroundLibraryManager',
  component: BackgroundLibraryManager,
};

export default meta;

type Story = StoryObj<typeof BackgroundLibraryManager>;

function entry(id: string, label: string): BackgroundLibraryEntry {
  return {
    id,
    label,
    background: {
      fileName: `bg-${id}.png`,
      stillFileName: null,
      width: 1920,
      height: 1080,
      animated: false,
    },
  };
}

function seeded(
  library: IBackgroundLibraryView,
  mode: BackgroundSelectionMode = 'single'
): NonNullable<Story['decorators']> {
  return [
    StoryComponent => {
      useBackgroundSelectionStore.setState({ mode, rotationInterval: 'daily', schedule: {} });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      client.setQueryData(backgroundLibraryKeys.library, library);
      return (
        <QueryClientProvider client={client}>
          <div className="max-w-[460px] p-4">
            <StoryComponent />
          </div>
        </QueryClientProvider>
      );
    },
  ];
}

/** An empty library: just the add tile and the format hint. */
export const Empty: Story = {
  decorators: seeded({ entries: [], activeId: null }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /Add image/ })).toBeInTheDocument();
  },
};

/** Three saved scenes; the active pick carries the check badge. */
export const SavedScenes: Story = {
  decorators: seeded({
    entries: [entry('1', 'Rainy desk'), entry('2', 'Night city'), entry('3', 'Forest window')],
    activeId: '2',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Show Night city' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  },
};

/** Rotation mode: the interval chips appear under the mode picker. */
export const Rotation: Story = {
  decorators: seeded(
    { entries: [entry('1', 'Rainy desk'), entry('2', 'Night city')], activeId: '1' },
    'rotation'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Every launch')).toBeInTheDocument();
  },
};

/** Time-of-day mode: one mapping row per room-light stop. */
export const TimeOfDay: Story = {
  decorators: seeded(
    { entries: [entry('1', 'Rainy desk'), entry('2', 'Night city')], activeId: '1' },
    'timeOfDay'
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Golden hour')).toBeInTheDocument();
    await expect(canvas.getByText('Night')).toBeInTheDocument();
  },
};
