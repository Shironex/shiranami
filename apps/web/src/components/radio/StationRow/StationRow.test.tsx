import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/lib/i18n';
import type { Station } from 'radio-browser-api';
import type { RowComponentProps } from 'react-window';

import StationRow from './StationRow';
import type { IStationRowProps } from './StationRow.types';

function makeStation(overrides: Partial<Station> = {}): Station {
  return {
    changeId: '',
    id: 'station-1',
    name: 'Lofi Radio',
    url: 'http://stream.example.com',
    urlResolved: 'http://stream.example.com/resolved',
    homepage: 'http://example.com',
    favicon: '',
    tags: ['lofi', 'chillout'],
    country: 'United States',
    countryCode: 'US',
    state: '',
    language: ['english'],
    votes: 100,
    lastChangeTime: new Date(),
    codec: 'MP3',
    bitrate: 128,
    hls: false,
    lastCheckOk: true,
    lastCheckTime: new Date(),
    lastCheckOkTime: new Date(),
    lastLocalCheckTime: new Date(),
    clickTimestamp: new Date(),
    clickCount: 500,
    clickTrend: 10,
    ...overrides,
  } as Station;
}

function renderRow(stations: Station[], overrides: Partial<IStationRowProps> = {}, index = 0) {
  const onPlay = overrides.onPlay ?? vi.fn();
  const onToggleFavorite = overrides.onToggleFavorite ?? vi.fn();
  const props = {
    index,
    style: undefined,
    stations,
    currentTrackId: null,
    isPlaying: false,
    favorites: [],
    ...overrides,
    onPlay,
    onToggleFavorite,
  } as unknown as RowComponentProps<IStationRowProps>;

  return { onPlay, onToggleFavorite, ...render(<StationRow {...props} />) };
}

describe('StationRow', () => {
  it('renders the station resolved from its index', () => {
    renderRow(
      [makeStation({ id: 'a', name: 'First' }), makeStation({ id: 'b', name: 'Second' })],
      {},
      1
    );

    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('renders nothing when the index is past the end of the list', () => {
    const { container } = renderRow([makeStation()], {}, 5);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the first two tags as a subtitle', () => {
    renderRow([makeStation({ tags: ['jazz', 'soul', 'funk'] })]);

    expect(screen.getByText('jazz, soul')).toBeInTheDocument();
  });

  it('calls onPlay with the row index when the station is clicked', () => {
    const { onPlay } = renderRow([makeStation({ name: 'Play me' })]);

    fireEvent.click(screen.getByText('Play me'));

    expect(onPlay).toHaveBeenCalledWith(0);
  });

  it('toggles the favorite without triggering playback', () => {
    const station = makeStation();
    const { onPlay, onToggleFavorite } = renderRow([station]);

    fireEvent.click(screen.getByRole('button', { name: /favorite/i }));

    expect(onToggleFavorite).toHaveBeenCalledWith(station);
    expect(onPlay).not.toHaveBeenCalled();
  });
});
