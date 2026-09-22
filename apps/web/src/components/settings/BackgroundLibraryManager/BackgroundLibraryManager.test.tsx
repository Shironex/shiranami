import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backgroundLibraryKeys,
  type IBackgroundLibraryView,
} from '@/hooks/queries/useBackgroundLibrary';
import { useBackgroundSelectionStore } from '@/stores/useBackgroundSelectionStore';
import type { BackgroundLibraryEntry } from '@shiranami/contracts/bindings';

import BackgroundLibraryManager from './BackgroundLibraryManager';

vi.mock('@/lib/bridge/stream-urls', () => ({
  toBackgroundUrl: (fileName: string) => `http://127.0.0.1:1234/tok/background/${fileName}`,
}));

function entry(id: string, label = ''): BackgroundLibraryEntry {
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

function renderManager(library: IBackgroundLibraryView): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(backgroundLibraryKeys.library, library);
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <BackgroundLibraryManager />
    </QueryClientProvider>
  );
  render(ui);
}

beforeEach(() => {
  useBackgroundSelectionStore.setState({ mode: 'single', rotationInterval: 'daily', schedule: {} });
});

describe('BackgroundLibraryManager', () => {
  it('renders a tile per saved background, marking the active pick', () => {
    renderManager({ entries: [entry('1', 'Rainy desk'), entry('2', 'Night city')], activeId: '2' });

    expect(screen.getByRole('button', { name: 'Show Rainy desk' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Show Night city' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('labels an unnamed (migrated) entry with the localized fallback', () => {
    renderManager({ entries: [entry('1')], activeId: '1' });

    expect(screen.getByRole('button', { name: 'Show Untitled' })).toBeInTheDocument();
  });

  it('offers the add tile, and per-tile rename and remove actions', () => {
    renderManager({ entries: [entry('1', 'Rainy desk')], activeId: '1' });

    expect(screen.getByRole('button', { name: /Add image/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Rainy desk' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Rainy desk' })).toBeInTheDocument();
  });

  it('hides the selection-mode controls until a second image exists', () => {
    renderManager({ entries: [entry('1')], activeId: '1' });

    expect(screen.queryByText('Which image shows')).not.toBeInTheDocument();
  });

  it('switches between rotation and schedule controls with the mode chips', async () => {
    const user = userEvent.setup();
    renderManager({ entries: [entry('1', 'A'), entry('2', 'B')], activeId: '1' });

    expect(screen.getByText('Which image shows')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rotation' }));
    expect(useBackgroundSelectionStore.getState().mode).toBe('rotation');
    expect(screen.getByText('Every launch')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Time of day' }));
    expect(useBackgroundSelectionStore.getState().mode).toBe('timeOfDay');
    // One mapping row per room-light stop, labelled with the shared stop names.
    expect(screen.getByText('Golden hour')).toBeInTheDocument();
    expect(screen.getByText('Dawn')).toBeInTheDocument();
  });

  it('opens the inline rename with the current label prefilled', async () => {
    const user = userEvent.setup();
    renderManager({ entries: [entry('1', 'Rainy desk')], activeId: '1' });

    await user.click(screen.getByRole('button', { name: 'Rename Rainy desk' }));

    expect(screen.getByRole('textbox')).toHaveValue('Rainy desk');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
