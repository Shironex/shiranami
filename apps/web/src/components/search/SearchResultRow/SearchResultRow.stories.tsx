import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SearchResult } from '@/types/electron';
import type { DownloadState } from '@/hooks/useSearch';

import SearchResultRow from './SearchResultRow';

/** Build a realistic search result; override fields per story. */
function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'vid-1',
    title: 'Lofi beats to relax and study to',
    uploader: 'Lofi Girl',
    duration: 210,
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    view_count: 1_240_000,
    ...overrides,
  } as SearchResult;
}

function makeState(overrides: Partial<DownloadState> = {}): DownloadState {
  return { progress: 0, status: 'idle', ...overrides };
}

const meta: Meta<typeof SearchResultRow> = {
  title: 'search/SearchResultRow',
  component: SearchResultRow,
  args: {
    previewLoadingId: null,
    isPreviewPlaying: () => false,
    onPreview: () => {},
    onDownload: () => {},
  },
  decorators: [
    Story => (
      <div className="w-[34rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SearchResultRow>;

export const Default: Story = {
  args: {
    result: makeResult(),
    downloadState: makeState(),
  },
};

export const Downloading: Story = {
  args: {
    result: makeResult({ id: 'vid-dl', title: 'Midnight study session' }),
    downloadState: makeState({ status: 'downloading', progress: 42 }),
  },
};

export const Done: Story = {
  args: {
    result: makeResult({ id: 'vid-done', title: 'Warm evening lights' }),
    downloadState: makeState({ status: 'done', progress: 100 }),
  },
};

export const Errored: Story = {
  args: {
    result: makeResult({ id: 'vid-err', title: 'Broken stream' }),
    downloadState: makeState({ status: 'error', error: 'Network timeout' }),
  },
};
