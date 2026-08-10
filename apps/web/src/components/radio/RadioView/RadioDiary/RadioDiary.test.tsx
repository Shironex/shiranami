import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/lib/i18n';
import type { RadioLogEntry } from '@shiranami/contracts';

import RadioDiary from './RadioDiary';
import { useRadioDiaryStore } from '@/stores/useRadioDiaryStore';

const STATION = '11111111-1111-4111-8111-111111111111';

const enqueueDownload = vi.fn(async () => undefined);
const search = vi.fn();
const logGet = vi.fn();
const logRecord = vi.fn(async () => null);

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true, IS_E2E: false }));

function entry(overrides: Partial<RadioLogEntry> = {}): RadioLogEntry {
  return {
    id: 1,
    stationUuid: STATION,
    raw: 'Cornelius - Drop',
    artist: 'Cornelius',
    title: 'Drop',
    heardAt: '2026-08-01T10:30:00.000Z',
    ...overrides,
  };
}

/** What the panel's own read will answer with when it mounts. */
function seedDiary(entries: RadioLogEntry[]) {
  logGet.mockResolvedValue(entries);
}

beforeEach(() => {
  vi.clearAllMocks();
  logGet.mockResolvedValue([]);
  useRadioDiaryStore.setState({ stationUuid: null, entries: [], isLoading: false });
  // The shim's surface, narrowed to what this panel reaches for.
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    radio: { log: { get: logGet, record: logRecord } },
    downloader: { search, enqueueDownload },
  };
});

describe('RadioDiary', () => {
  it('renders the raw title the station sent, not the derived split', async () => {
    seedDiary([entry({ raw: 'Now on Air: the breakfast show', artist: null, title: null })]);

    render(<RadioDiary stationUuid={STATION} stationName="Groove Salad" onClose={vi.fn()} />);

    expect(await screen.findByText('Now on Air: the breakfast show')).toBeInTheDocument();
  });

  it('names the station whose diary it is', async () => {
    seedDiary([entry()]);

    render(<RadioDiary stationUuid={STATION} stationName="Groove Salad" onClose={vi.fn()} />);

    expect(await screen.findByText('Groove Salad')).toBeInTheDocument();
  });

  it('says nothing is on air rather than showing a stale station', () => {
    render(<RadioDiary stationUuid={null} stationName={null} onClose={vi.fn()} />);

    expect(screen.getByText(/collect here/i)).toBeInTheDocument();
    expect(logGet).not.toHaveBeenCalled();
  });

  it('searches for the raw title and hands the best match to the download queue', async () => {
    search.mockResolvedValue([
      {
        id: 'yt-1',
        title: 'Cornelius - Drop',
        uploader: 'Cornelius',
        duration: 200,
        thumbnail: 'https://img.example/1.jpg',
        url: 'https://stream.example/1',
        webpage_url: 'https://youtube.example/watch?v=yt-1',
      },
    ]);
    seedDiary([entry()]);

    render(<RadioDiary stationUuid={STATION} stationName="Groove Salad" onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /Cornelius - Drop/ }));

    expect(search).toHaveBeenCalledWith('Cornelius - Drop');
    await waitFor(() => {
      expect(enqueueDownload).toHaveBeenCalledWith(
        expect.objectContaining({ youtubeId: 'yt-1', url: 'https://youtube.example/watch?v=yt-1' })
      );
    });
  });

  it('downloads nothing until the action is clicked', async () => {
    seedDiary([entry()]);

    render(<RadioDiary stationUuid={STATION} stationName="Groove Salad" onClose={vi.fn()} />);
    await screen.findByText('Cornelius - Drop');

    expect(search).not.toHaveBeenCalled();
    expect(enqueueDownload).not.toHaveBeenCalled();
  });

  it('closes on request', async () => {
    const onClose = vi.fn();
    seedDiary([entry()]);

    render(<RadioDiary stationUuid={STATION} stationName="Groove Salad" onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
