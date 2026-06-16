import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fn } from 'storybook/test';

import ImportDialog from './ImportDialog';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/**
 * shared · ImportDialog. A modal that resolves a share code, previews the shared
 * track (or playlist + editable name), then downloads + imports each track with a
 * per-row progress indicator. Driven by `useShareImport`, which is an IPC no-op
 * in the browser run, so the dialog rests in its loading state. Needs a
 * QueryClient (the import hook invalidates playlist queries). Rendered open.
 */
const meta: Meta<typeof ImportDialog> = {
  title: 'shared/ImportDialog',
  component: ImportDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    code: 'abc123',
  },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ImportDialog>;

/** Resolving a share code — rests in the loading state without a live backend. */
export const Default: Story = {};
