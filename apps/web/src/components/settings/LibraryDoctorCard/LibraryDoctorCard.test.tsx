import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DoctorScanResult } from '@shiranami/contracts';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';

import LibraryDoctorCard from './LibraryDoctorCard';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

function resetStores(): void {
  useLibraryStore.setState({ library: [], libraryLoaded: true });
}

/** The v2 mock always provides `doctor`; the contract types it optional. */
function scanMock() {
  const doctor = window.electronAPI.doctor;
  if (!doctor) throw new Error('the test mock must provide the doctor namespace');
  return vi.mocked(doctor.scan);
}

beforeEach(resetStores);
afterEach(resetStores);

describe('LibraryDoctorCard', () => {
  it('renders the card chrome and the run affordance', () => {
    render(<LibraryDoctorCard />);

    expect(screen.getByText('Library health')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run check/ })).toBeInTheDocument();
  });

  it('submits the library and renders severity-ranked findings', async () => {
    const report: DoctorScanResult = {
      scanned: 2,
      healthy: 0,
      cancelled: false,
      findings: [
        {
          trackId: 'a',
          title: 'Clipped Master',
          filePath: '/music/a.mp3',
          kind: 'clipping',
          severity: 'info',
          truePeakDb: 0.4,
        },
        {
          trackId: 'b',
          title: 'Half Download',
          filePath: '/music/b.mp3',
          kind: 'truncated',
          severity: 'warning',
        },
      ],
    };
    const scan = scanMock();
    scan.mockClear();
    scan.mockResolvedValueOnce(report);
    useLibraryStore.setState({
      library: [
        makeTrack({ id: 'a', filePath: '/music/a.mp3', title: 'Clipped Master' }),
        makeTrack({ id: 'b', filePath: '/music/b.mp3', title: 'Half Download' }),
      ],
    });

    render(<LibraryDoctorCard />);
    fireEvent.click(screen.getByRole('button', { name: /Run check/ }));

    expect(await screen.findByText('Checked 2 files — 2 findings')).toBeInTheDocument();
    expect(scan).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a', filePath: '/music/a.mp3', duration: 215 }),
      expect.objectContaining({ id: 'b' }),
    ]);

    // Warning outranks info in the list order.
    const items = screen.getByTestId('doctor-findings').querySelectorAll('li');
    expect(items[0]).toHaveTextContent('Half Download');
    expect(items[0]).toHaveTextContent('File ends early — likely an interrupted download');
    expect(items[1]).toHaveTextContent('True peak 0.4 dBTP — above full scale');
  });

  it('reports a clean bill of health without a findings list', async () => {
    const scan = scanMock();
    scan.mockClear();
    scan.mockResolvedValueOnce({ scanned: 3, healthy: 3, cancelled: false, findings: [] });
    useLibraryStore.setState({ library: [makeTrack()] });

    render(<LibraryDoctorCard />);
    fireEvent.click(screen.getByRole('button', { name: /Run check/ }));

    expect(await screen.findByText('All 3 files decoded clean')).toBeInTheDocument();
    expect(screen.queryByTestId('doctor-findings')).not.toBeInTheDocument();
  });
});
