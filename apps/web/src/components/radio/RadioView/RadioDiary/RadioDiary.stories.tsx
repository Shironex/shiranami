import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { RadioLogEntry } from '@shiranami/contracts';

import RadioDiary from './RadioDiary';
import { useRadioDiaryStore } from '@/stores/useRadioDiaryStore';

const STATION = '11111111-1111-4111-8111-111111111111';

const ENTRIES: RadioLogEntry[] = [
  {
    id: 3,
    stationUuid: STATION,
    raw: 'Cornelius - Drop',
    artist: 'Cornelius',
    title: 'Drop',
    heardAt: '2026-08-01T10:42:00.000Z',
  },
  {
    id: 2,
    stationUuid: STATION,
    raw: 'SomaFM - Groove Salad',
    artist: 'SomaFM',
    title: 'Groove Salad',
    heardAt: '2026-08-01T10:38:00.000Z',
  },
  {
    id: 1,
    stationUuid: STATION,
    raw: 'Boards of Canada - Roygbiv',
    artist: 'Boards of Canada',
    title: 'Roygbiv',
    heardAt: '2026-08-01T10:31:00.000Z',
  },
];

/**
 * radio · RadioDiary. The quiet log beside the station list: every distinct
 * title the station on air has announced, newest first, with the time it was
 * heard. Each row shows the station's whole `StreamTitle` — the artist/title
 * split is a best-effort guess and never replaces what actually came over the
 * air — and offers a hover-revealed action that looks the title up and hands it
 * to the download queue. Nothing downloads without that click.
 *
 * The stored row keeps the string exactly as it decoded; the panel NFKC-folds
 * it at render, the same fold the player's title line applies, so the two
 * surfaces never disagree about what the station is saying.
 */
const meta: Meta<typeof RadioDiary> = {
  title: 'radio/RadioDiary',
  component: RadioDiary,
  parameters: {
    // The close button and every row action are aria-labelled, and the panel
    // itself is a labelled landmark — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    stationUuid: STATION,
    stationName: 'SomaFM Groove Salad',
    onClose: () => {},
  },
  decorators: [
    (Story, context) => {
      // The panel reads its entries from the store; a story seeds them there
      // rather than through the IPC surface Storybook does not have.
      const seeded = context.args.stationUuid === null ? [] : ENTRIES;
      useRadioDiaryStore.setState({
        stationUuid: context.args.stationUuid,
        entries: seeded,
        isLoading: false,
      });
      return (
        <div className="flex h-[26rem] p-4">
          <Story />
        </div>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof RadioDiary>;

/** A station mid-set: three titles, newest first. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Cornelius - Drop')).toBeInTheDocument();
    await expect(canvas.getByText('SomaFM Groove Salad')).toBeInTheDocument();
  },
};

/** Nothing playing — the panel says so instead of showing a stale station. */
export const NothingOnAir: Story = {
  args: {
    stationUuid: null,
    stationName: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/collect here/i)).toBeInTheDocument();
  },
};
