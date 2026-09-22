import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SleepTimer } from './index';

function renderSleepTimer() {
  return render(
    <TooltipProvider>
      <SleepTimer />
    </TooltipProvider>
  );
}

const mockState = vi.hoisted(() => ({
  endTime: null as number | null,
  remaining: 0,
  windDown: false,
  stopMode: null as 'track' | 'album' | null,
  start: vi.fn(),
  startWindDown: vi.fn(),
  startStopAfter: vi.fn(),
  cancel: vi.fn(),
}));

const mockWindDownState = vi.hoisted(() => ({
  lengthMinutes: 15 as number,
  setLength: vi.fn(),
}));

vi.mock('@/stores/useSleepTimerStore', () => ({
  useSleepTimerStore: <T,>(selector: (s: typeof mockState) => T) => selector(mockState),
  SLEEP_TIMER_PRESETS: [15, 30, 45, 60, 90],
  SLEEP_TIMER_MIN_MINUTES: 1,
  SLEEP_TIMER_MAX_MINUTES: 600,
}));

vi.mock('@/stores/useWindDownStore', () => ({
  useWindDownStore: <T,>(selector: (s: typeof mockWindDownState) => T) =>
    selector(mockWindDownState),
  WIND_DOWN_LENGTH_CHOICES: [0, 5, 10, 15, 20],
  DEFAULT_WIND_DOWN_MINUTES: 15,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${key}:${opts.count}`;
      if (opts && 'time' in opts) return `${key}:${opts.time}`;
      return key;
    },
  }),
}));

describe('SleepTimer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.endTime = null;
    mockState.remaining = 0;
    mockState.windDown = false;
    mockState.stopMode = null;
    mockState.start.mockReset();
    mockState.startWindDown.mockReset();
    mockState.startStopAfter.mockReset();
    mockState.cancel.mockReset();
    mockWindDownState.lengthMinutes = 15;
    mockWindDownState.setLength.mockReset();
  });

  it('renders the timer button', () => {
    renderSleepTimer();
    expect(screen.getByRole('button', { name: 'label' })).toBeInTheDocument();
  });

  it('applies inactive styling when no timer is set', () => {
    renderSleepTimer();
    const button = screen.getByRole('button', { name: 'label' });
    expect(button.className).toContain('text-muted-foreground');
    expect(button.className).not.toContain('text-primary');
  });

  it('applies active styling when timer is running', () => {
    mockState.endTime = Date.now() + 60000;
    mockState.remaining = 60;
    renderSleepTimer();

    const button = screen.getByRole('button', { name: 'label' });
    expect(button.className).toContain('text-primary');
    expect(button.className).toContain('bg-primary/10');
  });

  it('shows pulsing indicator dot when timer is active', () => {
    mockState.endTime = Date.now() + 60000;
    mockState.remaining = 60;
    renderSleepTimer();

    const button = screen.getByRole('button', { name: 'label' });
    const dot = button.querySelector('.animate-pulse');
    expect(dot).toBeInTheDocument();
  });

  it('does not show pulsing indicator dot when timer is inactive', () => {
    renderSleepTimer();
    const button = screen.getByRole('button', { name: 'label' });
    const dot = button.querySelector('.animate-pulse');
    expect(dot).not.toBeInTheDocument();
  });

  it('opens popover with preset options on click', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));

    expect(screen.getByText('minutes:15')).toBeInTheDocument();
    expect(screen.getByText('minutes:30')).toBeInTheDocument();
    expect(screen.getByText('minutes:45')).toBeInTheDocument();
    expect(screen.getByText('minutes:60')).toBeInTheDocument();
    expect(screen.getByText('minutes:90')).toBeInTheDocument();
  });

  it('shows "stopAfter" heading when inactive', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    expect(screen.getByText('stopAfter')).toBeInTheDocument();
  });

  it('shows "active" heading and remaining time when timer is running', async () => {
    mockState.endTime = Date.now() + 900_000;
    mockState.remaining = 900;

    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));

    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('15:00')).toBeInTheDocument();
    expect(screen.getByText('remaining')).toBeInTheDocument();
  });

  it('calls start with selected preset minutes and closes popover', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    await user.click(screen.getByText('minutes:30'));

    expect(mockState.start).toHaveBeenCalledWith(30);
  });

  it('shows cancel button when timer is active', async () => {
    mockState.endTime = Date.now() + 60000;
    mockState.remaining = 60;

    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    expect(screen.getByText('cancelTimer')).toBeInTheDocument();
  });

  it('does not show cancel button when timer is inactive', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    expect(screen.queryByText('cancelTimer')).not.toBeInTheDocument();
  });

  it('calls cancel when cancel button is clicked', async () => {
    mockState.endTime = Date.now() + 60000;
    mockState.remaining = 60;

    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    await user.click(screen.getByText('cancelTimer'));

    expect(mockState.cancel).toHaveBeenCalledOnce();
  });

  it('formats remaining time correctly for various values', async () => {
    mockState.endTime = Date.now() + 5_400_000;
    mockState.remaining = 5400;

    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    expect(screen.getByText('90:00')).toBeInTheDocument();
  });

  it('formats remaining time with leading zero on seconds', async () => {
    mockState.endTime = Date.now() + 65_000;
    mockState.remaining = 65;

    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    expect(screen.getByText('1:05')).toBeInTheDocument();
  });

  it('renders Custom button in preset list', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    expect(screen.getByText('custom')).toBeInTheDocument();
  });

  it('renders the end-of-track and end-of-album options', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    expect(screen.getByText('endOfTrack')).toBeInTheDocument();
    expect(screen.getByText('endOfAlbum')).toBeInTheDocument();
  });

  it('arms the end-of-track stop and closes the popover', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    await user.click(screen.getByText('endOfTrack'));

    expect(mockState.startStopAfter).toHaveBeenCalledWith('track');
    expect(mockState.start).not.toHaveBeenCalled();
  });

  it('arms the end-of-album stop', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    await user.click(screen.getByText('endOfAlbum'));

    expect(mockState.startStopAfter).toHaveBeenCalledWith('album');
  });

  it('shows the boundary-stop label (no countdown) and cancel while armed', async () => {
    mockState.stopMode = 'track';

    const user = userEvent.setup();
    renderSleepTimer();

    const trigger = screen.getByRole('button', { name: 'label' });
    expect(trigger.className).toContain('text-primary');

    await user.click(trigger);
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('stopAtTrackEnd')).toBeInTheDocument();
    expect(screen.queryByText('remaining')).not.toBeInTheDocument();
    expect(screen.getByText('cancelTimer')).toBeInTheDocument();
  });

  it('shows the album label for an armed end-of-album stop', async () => {
    mockState.stopMode = 'album';

    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    expect(screen.getByText('stopAtAlbumEnd')).toBeInTheDocument();
  });

  it('renders the wind-down option under the presets', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    expect(screen.getByText('windDown')).toBeInTheDocument();
    expect(screen.getByText('windDownHint:15')).toBeInTheDocument();
  });

  it('renders the wind-down length chips with the stored length pressed', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));

    const group = screen.getByRole('group', { name: 'windDownLength' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'off', pressed: false })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'windDownLengthChoice:15', pressed: true })
    ).toBeInTheDocument();
  });

  it('clicking a length chip stores it without starting anything or closing', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    await user.click(screen.getByRole('button', { name: 'windDownLengthChoice:5' }));

    expect(mockWindDownState.setLength).toHaveBeenCalledWith(5);
    expect(mockState.start).not.toHaveBeenCalled();
    expect(mockState.startWindDown).not.toHaveBeenCalled();
    // The popover stays open for further adjustment.
    expect(screen.getByText('windDown')).toBeInTheDocument();
  });

  it('disables the wind-down option and swaps the hint when the setting is off', async () => {
    mockWindDownState.lengthMinutes = 0;

    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));

    expect(screen.getByText('windDown').closest('button')).toBeDisabled();
    expect(screen.getByText('windDownOff')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'off', pressed: true })).toBeInTheDocument();
  });

  it('starts the wind-down ending when its option is clicked', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    await user.click(screen.getByText('windDown'));

    expect(mockState.startWindDown).toHaveBeenCalledOnce();
    expect(mockState.start).not.toHaveBeenCalled();
  });

  it('shows the winding-down heading while a wind-down runs', async () => {
    mockState.endTime = Date.now() + 900_000;
    mockState.remaining = 900;
    mockState.windDown = true;

    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    expect(screen.getByText('windingDown')).toBeInTheDocument();
    expect(screen.queryByText('active')).not.toBeInTheDocument();
  });

  it('clicking Custom switches to input view', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    await user.click(screen.getByText('custom'));

    expect(screen.getByRole('spinbutton', { name: 'customLabel' })).toBeInTheDocument();
    expect(screen.getByText('customStart')).toBeInTheDocument();
    expect(screen.getByText('customBack')).toBeInTheDocument();
    expect(screen.queryByText('minutes:15')).not.toBeInTheDocument();
  });

  it('submitting a valid value calls start with that number', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    await user.click(screen.getByText('custom'));
    await user.type(screen.getByRole('spinbutton', { name: 'customLabel' }), '25');
    await user.click(screen.getByText('customStart'));

    expect(mockState.start).toHaveBeenCalledWith(25);
  });

  it('submitting an invalid value does not call start and shows error', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    await user.click(screen.getByText('custom'));

    // empty input
    await user.click(screen.getByText('customStart'));
    expect(mockState.start).not.toHaveBeenCalled();
    expect(screen.getByText('customError')).toBeInTheDocument();

    // out of range
    const input = screen.getByRole('spinbutton', { name: 'customLabel' });
    await user.clear(input);
    await user.type(input, '601');
    await user.click(screen.getByText('customStart'));
    expect(mockState.start).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, '0');
    await user.click(screen.getByText('customStart'));
    expect(mockState.start).not.toHaveBeenCalled();
  });

  it('Back returns to preset list without calling start', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    await user.click(screen.getByRole('button', { name: 'label' }));
    await user.click(screen.getByText('custom'));
    await user.click(screen.getByText('customBack'));

    expect(mockState.start).not.toHaveBeenCalled();
    expect(screen.getByText('minutes:15')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'customLabel' })).not.toBeInTheDocument();
  });

  it('reopening popover resets to preset view', async () => {
    const user = userEvent.setup();
    renderSleepTimer();

    // open, switch to custom
    await user.click(screen.getByRole('button', { name: 'label' }));
    await user.click(screen.getByText('custom'));
    expect(screen.getByRole('spinbutton', { name: 'customLabel' })).toBeInTheDocument();

    // close popover
    await user.keyboard('{Escape}');

    // reopen — should land on presets
    await user.click(screen.getByRole('button', { name: 'label' }));
    expect(screen.queryByRole('spinbutton', { name: 'customLabel' })).not.toBeInTheDocument();
    expect(screen.getByText('minutes:15')).toBeInTheDocument();
  });
});
