import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SleepTimer } from './SleepTimer';

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
  start: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('@/stores/useSleepTimerStore', () => ({
  useSleepTimerStore: <T,>(selector: (s: typeof mockState) => T) => selector(mockState),
  SLEEP_TIMER_PRESETS: [15, 30, 45, 60, 90],
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
    mockState.start.mockReset();
    mockState.cancel.mockReset();
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
