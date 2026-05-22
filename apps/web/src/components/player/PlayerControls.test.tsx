import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PlayerControls } from './PlayerControls';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (opts) {
        return Object.entries(opts).reduce((s, [k, v]) => s.replace(`{{${k}}}`, v), key);
      }
      return key;
    },
  }),
}));

const mockState = vi.hoisted(() => ({
  currentTrack: { id: '1', title: 'Test Track' } as unknown,
  isPlaying: false,
  isLoading: false,
  isShuffled: false,
  repeatMode: 'off' as 'off' | 'all' | 'one',
  togglePlay: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
  toggleShuffle: vi.fn(),
  cycleRepeatMode: vi.fn(),
}));

vi.mock('@/stores/usePlaybackStore', () => ({
  usePlaybackStore: <T,>(selector: (s: typeof mockState) => T) => selector(mockState),
}));

function renderControls() {
  return render(
    <TooltipProvider>
      <PlayerControls />
    </TooltipProvider>
  );
}

describe('PlayerControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.currentTrack = { id: '1', title: 'Test Track' };
    mockState.isPlaying = false;
    mockState.isLoading = false;
    mockState.isShuffled = false;
    mockState.repeatMode = 'off';
  });

  it('renders play button when not playing', () => {
    renderControls();
    expect(screen.getByRole('button', { name: 'play' })).toBeInTheDocument();
  });

  it('renders pause button when playing', () => {
    mockState.isPlaying = true;
    renderControls();
    expect(screen.getByRole('button', { name: 'pause' })).toBeInTheDocument();
  });

  it('calls togglePlay when play/pause button is clicked', async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole('button', { name: 'play' }));
    expect(mockState.togglePlay).toHaveBeenCalledOnce();
  });

  it('calls next when next button is clicked', async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole('button', { name: 'next' }));
    expect(mockState.next).toHaveBeenCalledOnce();
  });

  it('calls previous when previous button is clicked', async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole('button', { name: 'previous' }));
    expect(mockState.previous).toHaveBeenCalledOnce();
  });

  it('calls toggleShuffle when shuffle button is clicked', async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole('button', { name: 'shuffle' }));
    expect(mockState.toggleShuffle).toHaveBeenCalledOnce();
  });

  it('applies active styling to shuffle button when shuffle is on', () => {
    mockState.isShuffled = true;
    renderControls();

    const shuffleButton = screen.getByRole('button', { name: 'shuffle' });
    expect(shuffleButton.className).toContain('text-primary');
  });

  it('applies inactive styling to shuffle button when shuffle is off', () => {
    mockState.isShuffled = false;
    renderControls();

    const shuffleButton = screen.getByRole('button', { name: 'shuffle' });
    expect(shuffleButton.className).toContain('text-muted-foreground');
  });

  it('calls cycleRepeatMode when repeat button is clicked', async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole('button', { name: 'repeatAria' }));
    expect(mockState.cycleRepeatMode).toHaveBeenCalledOnce();
  });

  it('applies inactive styling to repeat button when repeat is off', () => {
    mockState.repeatMode = 'off';
    renderControls();

    const repeatButton = screen.getByRole('button', { name: 'repeatAria' });
    expect(repeatButton.className).toContain('text-muted-foreground');
  });

  it('applies active styling to repeat button when repeat is all', () => {
    mockState.repeatMode = 'all';
    renderControls();

    const repeatButton = screen.getByRole('button', { name: 'repeatAria' });
    expect(repeatButton.className).toContain('text-primary');
  });

  it('applies active styling to repeat button when repeat is one', () => {
    mockState.repeatMode = 'one';
    renderControls();

    const repeatButton = screen.getByRole('button', { name: 'repeatAria' });
    expect(repeatButton.className).toContain('text-primary');
  });

  it('disables play/pause button when no track is loaded', () => {
    mockState.currentTrack = null;
    renderControls();

    const playButton = screen.getByRole('button', { name: 'play' });
    expect(playButton).toBeDisabled();
  });

  it('enables play/pause button when a track is loaded', () => {
    renderControls();

    const playButton = screen.getByRole('button', { name: 'play' });
    expect(playButton).not.toBeDisabled();
  });
});
