import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { VolumeControl } from './index';

const mockState = vi.hoisted(() => ({
  volume: 0.75,
  isMuted: false,
  setVolume: vi.fn(),
  toggleMute: vi.fn(),
}));

vi.mock('@/stores/usePlaybackStore', () => {
  const mock = Object.assign(<T,>(selector: (s: typeof mockState) => T) => selector(mockState), {
    getState: () => mockState,
  });
  return { usePlaybackStore: mock };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

function renderVolumeControl(props?: { sliderClassName?: string }) {
  return render(
    <TooltipProvider>
      <VolumeControl {...props} />
    </TooltipProvider>
  );
}

describe('VolumeControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.volume = 0.75;
    mockState.isMuted = false;
    mockState.setVolume.mockReset();
    mockState.toggleMute.mockReset();
  });

  it('renders the volume slider with the current volume', () => {
    renderVolumeControl();
    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('aria-valuenow', '0.75');
  });

  it('shows high volume icon (Volume2) when volume >= 0.5', () => {
    mockState.volume = 0.8;
    renderVolumeControl();
    const button = screen.getByRole('button', { name: 'mute' });
    expect(button).toBeInTheDocument();
    // Volume2 icon should be rendered (not VolumeX or Volume1)
    const svg = button.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('shows low volume icon (Volume1) when volume < 0.5 and > 0', () => {
    mockState.volume = 0.3;
    renderVolumeControl();
    const button = screen.getByRole('button', { name: 'mute' });
    expect(button).toBeInTheDocument();
  });

  it('shows muted icon (VolumeX) when volume is 0', () => {
    mockState.volume = 0;
    renderVolumeControl();
    // When volume is 0, aria-label should be "unmute" since VolumeX is shown
    // Actually, isMuted is false, so label is still "mute" but the icon is VolumeX
    const button = screen.getByRole('button', { name: 'mute' });
    expect(button).toBeInTheDocument();
  });

  it('shows muted icon and unmute label when isMuted is true', () => {
    mockState.isMuted = true;
    renderVolumeControl();
    const button = screen.getByRole('button', { name: 'unmute' });
    expect(button).toBeInTheDocument();
  });

  it('shows mute label when not muted', () => {
    mockState.isMuted = false;
    renderVolumeControl();
    const button = screen.getByRole('button', { name: 'mute' });
    expect(button).toBeInTheDocument();
  });

  it('calls toggleMute when the volume button is clicked', async () => {
    const user = userEvent.setup();
    renderVolumeControl();
    const button = screen.getByRole('button', { name: 'mute' });
    await user.click(button);
    expect(mockState.toggleMute).toHaveBeenCalledOnce();
  });

  it('slider shows 0 when muted regardless of actual volume', () => {
    mockState.isMuted = true;
    mockState.volume = 0.6;
    renderVolumeControl();
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('slider reflects volume when not muted', () => {
    mockState.volume = 0.42;
    renderVolumeControl();
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '0.42');
  });
});

describe('wheel volume control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.volume = 0.5;
    mockState.isMuted = false;
    mockState.setVolume.mockReset();
    mockState.toggleMute.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function dispatchWheel(root: Element, deltaY: number): WheelEvent {
    const ev = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
    root.dispatchEvent(ev);
    return ev;
  }

  it('scroll up (deltaY < 0) calls setVolume with current + 0.05', () => {
    vi.spyOn(performance, 'now').mockReturnValue(10000);
    mockState.volume = 0.5;
    const { container } = renderVolumeControl();
    const root = container.querySelector('div')!;
    dispatchWheel(root, -120);
    expect(mockState.setVolume).toHaveBeenCalledOnce();
    expect(mockState.setVolume).toHaveBeenCalledWith(0.5 + 0.05);
  });

  it('scroll down (deltaY > 0) calls setVolume with current - 0.05', () => {
    vi.spyOn(performance, 'now').mockReturnValue(10000);
    mockState.volume = 0.5;
    const { container } = renderVolumeControl();
    const root = container.querySelector('div')!;
    dispatchWheel(root, 120);
    expect(mockState.setVolume).toHaveBeenCalledOnce();
    expect(mockState.setVolume).toHaveBeenCalledWith(0.5 - 0.05);
  });

  it('two wheel events within 40ms call setVolume only once (throttle)', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(10000).mockReturnValueOnce(10020);
    mockState.volume = 0.5;
    const { container } = renderVolumeControl();
    const root = container.querySelector('div')!;
    dispatchWheel(root, -120);
    dispatchWheel(root, -120);
    expect(mockState.setVolume).toHaveBeenCalledOnce();
  });

  it('calls preventDefault on the wheel event', () => {
    vi.spyOn(performance, 'now').mockReturnValue(10000);
    const { container } = renderVolumeControl();
    const root = container.querySelector('div')!;
    const ev = dispatchWheel(root, -120);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('rounds the new volume to 2 decimals to avoid floating-point drift', () => {
    vi.spyOn(performance, 'now').mockReturnValue(10000);
    mockState.volume = 0.55;
    const { container } = renderVolumeControl();
    const root = container.querySelector('div')!;
    dispatchWheel(root, -120);
    expect(mockState.setVolume).toHaveBeenCalledWith(0.6);
  });

  it('scroll down while muted does NOT call setVolume (would otherwise unmute)', () => {
    vi.spyOn(performance, 'now').mockReturnValue(10000);
    mockState.volume = 0.7;
    mockState.isMuted = true;
    const { container } = renderVolumeControl();
    const root = container.querySelector('div')!;
    dispatchWheel(root, 120);
    expect(mockState.setVolume).not.toHaveBeenCalled();
  });

  it('scroll up while muted DOES call setVolume (unmutes, matching keyboard ArrowUp)', () => {
    vi.spyOn(performance, 'now').mockReturnValue(10000);
    mockState.volume = 0.7;
    mockState.isMuted = true;
    const { container } = renderVolumeControl();
    const root = container.querySelector('div')!;
    dispatchWheel(root, -120);
    expect(mockState.setVolume).toHaveBeenCalledOnce();
    expect(mockState.setVolume).toHaveBeenCalledWith(0.75);
  });
});
