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
  // `clearAllMocks` clears calls, not implementations, so a test that makes the
  // enqueue reject would otherwise make every later one reject too.
  enqueueDownload.mockResolvedValue(undefined);
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

  it('folds a fancy-font title the way the player beside it does', async () => {
    seedDiary([entry({ raw: '𝕹𝖔𝖜 𝕻𝖑𝖆𝖞𝖎𝖓𝖌: Cornelius - Drop', artist: null, title: null })]);

    render(<RadioDiary stationUuid={STATION} stationName="Groove Salad" onClose={vi.fn()} />);

    // The player's title line NFKC-folds; this panel sits next to it showing
    // the same station's strings, so it has to reach the same answer.
    expect(await screen.findByText('Now Playing: Cornelius - Drop')).toBeInTheDocument();
  });

  it('searches for the folded title, which is the only form yt-dlp can match', async () => {
    search.mockResolvedValue([]);
    seedDiary([entry({ raw: '𝐂𝐨𝐫𝐧𝐞𝐥𝐢𝐮𝐬 - 𝐃𝐫𝐨𝐩', artist: null, title: null })]);

    render(<RadioDiary stationUuid={STATION} stationName="Groove Salad" onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /Cornelius - Drop/ }));

    await waitFor(() => expect(search).toHaveBeenCalledWith('Cornelius - Drop'));
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

  it('leaves the row retryable when the enqueue itself fails', async () => {
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
    // What a missing yt-dlp or a full disk looks like from here.
    enqueueDownload.mockRejectedValue(new Error('yt-dlp is not installed'));
    seedDiary([entry()]);

    render(<RadioDiary stationUuid={STATION} stationName="Groove Salad" onClose={vi.fn()} />);
    const action = await screen.findByRole('button', { name: /Cornelius - Drop/ });
    await userEvent.click(action);

    await waitFor(() => expect(enqueueDownload).toHaveBeenCalledTimes(1));

    // The point of not claiming success is that the user can try again:
    // `queued` disables the button, so a row that believed a download it never
    // got would stay locked until the panel unmounted.
    enqueueDownload.mockResolvedValue(undefined);
    await userEvent.click(action);
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(action).toBeDisabled());
  });

  it('marks the row done once the enqueue actually resolves', async () => {
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
    const action = await screen.findByRole('button', { name: /Cornelius - Drop/ });
    await userEvent.click(action);

    await waitFor(() => expect(action).toBeDisabled());
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
