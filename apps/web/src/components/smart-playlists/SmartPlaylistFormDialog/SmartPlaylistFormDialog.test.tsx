import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SmartPlaylist } from '@shiranami/contracts';

import SmartPlaylistFormDialog from './SmartPlaylistFormDialog';

/** The global the Tauri webview injects before any page script runs. */
const TAURI_GLOBAL = '__TAURI_INTERNALS__';

/**
 * Pretend this bundle is running inside the Tauri webview.
 *
 * Without it the dialog renders as the Electron build sees it, where the
 * v2-only fields and the sort/limit row are gated away — see
 * `availableFields` in `@/lib/smart-playlist-fields`.
 */
function inTauri(): void {
  Object.defineProperty(window, TAURI_GLOBAL, { value: {}, configurable: true });
}

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makePlaylist(overrides: Partial<SmartPlaylist> = {}): SmartPlaylist {
  return {
    id: 'sp-1',
    name: 'Late-night focus',
    description: null,
    matchType: 'all',
    rules: [{ field: 'genre', operator: 'is', value: 'lofi' }],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('SmartPlaylistFormDialog', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, TAURI_GLOBAL);
  });

  it('renders nothing while closed', () => {
    renderWithClient(<SmartPlaylistFormDialog open={false} onOpenChange={() => {}} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the create title and a blank rule row when opened without a playlist', () => {
    renderWithClient(<SmartPlaylistFormDialog open onOpenChange={() => {}} />);

    expect(screen.getByText('New Smart Playlist')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeInTheDocument();
  });

  it('seeds the name field from the edited playlist', () => {
    renderWithClient(
      <SmartPlaylistFormDialog open onOpenChange={() => {}} playlist={makePlaylist()} />
    );

    expect(screen.getByText('Edit Smart Playlist')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Late-night focus')).toBeInTheDocument();
  });

  it('cancel closes the dialog', async () => {
    const onOpenChange = vi.fn();
    renderWithClient(<SmartPlaylistFormDialog open onOpenChange={onOpenChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  describe('the sort and limit row', () => {
    it('is offered where the backend honours it', () => {
      inTauri();
      renderWithClient(<SmartPlaylistFormDialog open onOpenChange={() => {}} />);

      expect(screen.getByLabelText('Sort field')).toBeInTheDocument();
      expect(screen.getByLabelText('Sort direction')).toBeInTheDocument();
      expect(screen.getByLabelText('Track limit')).toBeInTheDocument();
    });

    /**
     * The Electron build ships this same renderer and drops both keys at its
     * IPC boundary, so a "top 25" authored there quietly returns every match.
     * Hiding the controls is the only honest option from inside `apps/web`.
     */
    it('is hidden where the backend discards it', () => {
      renderWithClient(<SmartPlaylistFormDialog open onOpenChange={() => {}} />);

      expect(screen.queryByLabelText('Sort field')).toBeNull();
      expect(screen.queryByLabelText('Sort direction')).toBeNull();
      expect(screen.queryByLabelText('Track limit')).toBeNull();
    });
  });

  describe('the field picker', () => {
    it('offers a v2-only field where it can be evaluated', () => {
      inTauri();
      renderWithClient(
        <SmartPlaylistFormDialog
          open
          onOpenChange={() => {}}
          playlist={makePlaylist({
            rules: [{ field: 'bpm', operator: 'greaterThan', value: '120' }],
          })}
        />
      );

      expect(screen.getByLabelText('Field')).toHaveTextContent('BPM');
    });

    /**
     * The rule that motivated the whole gate: `bpm greaterThan 120` reaches
     * v1's `ruleToCondition`, falls through to `default: return null`, and
     * leaves the definition with no conditions — which evaluates as the whole
     * library rather than as nothing.
     */
    it('does not offer a field the running backend would drop', async () => {
      renderWithClient(<SmartPlaylistFormDialog open onOpenChange={() => {}} />);

      await userEvent.click(screen.getByLabelText('Field'));

      for (const hidden of ['BPM', 'Musical key', 'Last played', 'Loudness (LUFS)']) {
        expect(screen.queryByRole('option', { name: hidden })).toBeNull();
      }
      expect(screen.getByRole('option', { name: 'Genre' })).toBeInTheDocument();
    });

    it('does not offer an operator the running backend would drop', async () => {
      renderWithClient(
        <SmartPlaylistFormDialog
          open
          onOpenChange={() => {}}
          playlist={makePlaylist({
            rules: [{ field: 'dateAdded', operator: 'inLastDays', value: '30' }],
          })}
        />
      );

      await userEvent.click(screen.getByLabelText('Operator'));

      expect(screen.getByRole('option', { name: 'in the last (days)' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'not in the last (days)' })).toBeNull();
    });
  });

  it('round-trips the new vocabulary, the sort and the limit back into the editor', () => {
    inTauri();
    renderWithClient(
      <SmartPlaylistFormDialog
        open
        onOpenChange={() => {}}
        playlist={makePlaylist({
          name: 'Fast keys',
          rules: [
            { field: 'bpm', operator: 'between', value: '120', valueTo: '140' },
            { field: 'musicalKey', operator: 'is', value: 'C major' },
            { field: 'lastPlayed', operator: 'notInLastDays', value: '30' },
          ],
          limit: 25,
          orderBy: { field: 'playCount', direction: 'asc' },
        })}
      />
    );

    expect(screen.getByDisplayValue('Fast keys')).toBeInTheDocument();

    const fields = screen.getAllByLabelText('Field');
    const operators = screen.getAllByLabelText('Operator');
    expect(fields).toHaveLength(3);
    expect(fields[0]).toHaveTextContent('BPM');
    expect(operators[0]).toHaveTextContent('between');
    expect(fields[1]).toHaveTextContent('Musical key');
    expect(operators[1]).toHaveTextContent('is');
    expect(fields[2]).toHaveTextContent('Last played');
    expect(operators[2]).toHaveTextContent('not in the last (days)');

    // `between` splits the value across two inputs; the others use one.
    expect(screen.getByLabelText('Upper value')).toHaveValue(140);
    const values = screen.getAllByLabelText('Value');
    expect(values[0]).toHaveValue(120);
    expect(values[1]).toHaveValue('C major');
    expect(values[2]).toHaveValue(30);

    expect(screen.getByLabelText('Sort field')).toHaveTextContent('Play count');
    expect(screen.getByLabelText('Sort direction')).toHaveTextContent('ascending');
    expect(screen.getByLabelText('Track limit')).toHaveValue(25);
  });
});
