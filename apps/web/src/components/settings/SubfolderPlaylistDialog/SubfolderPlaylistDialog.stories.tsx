import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SubfolderPlaylistDialog from './SubfolderPlaylistDialog';
import type { ISubfolderEntry } from './SubfolderPlaylistDialog.types';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const subfolders: ISubfolderEntry[] = [
  { name: 'Lofi Beats', path: '/music/Lofi Beats', tracks: [] },
  { name: 'Jazz Nights', path: '/music/Jazz Nights', tracks: [] },
  { name: 'Focus', path: '/music/Focus', tracks: [] },
];

const meta: Meta<typeof SubfolderPlaylistDialog> = {
  title: 'settings/SubfolderPlaylistDialog',
  component: SubfolderPlaylistDialog,
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SubfolderPlaylistDialog>;

export const Default: Story = {
  args: {
    open: true,
    subfolders,
    existingPlaylistNames: new Set(),
    onOpenChange: () => {},
    onConfirm: () => {},
  },
};

export const SomeAlreadyExist: Story = {
  args: {
    open: true,
    subfolders,
    existingPlaylistNames: new Set(['Focus']),
    onOpenChange: () => {},
    onConfirm: () => {},
  },
};
