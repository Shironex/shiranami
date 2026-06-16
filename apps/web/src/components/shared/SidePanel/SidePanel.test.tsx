import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import SidePanel from './SidePanel';
import { useLayoutStore } from '@/stores/useLayoutStore';

// ── Shared spies ──

const setRightPanelWidth = vi.fn();
const resetRightPanelWidth = vi.fn();
const resizeHandleProps = vi.fn();

// ── Default store state ──

let storeState: Record<string, unknown> = {};

function setStoreState(overrides: Record<string, unknown>) {
  storeState = {
    rightPanel: 'queue',
    rightPanelWidth: 320,
    setRightPanelWidth,
    resetRightPanelWidth,
    ...overrides,
  };
}

// ── Mocks ──

vi.mock('@/stores/useViewStore', () => ({
  useViewStore: <T,>(selector: (s: Record<string, unknown>) => T) => selector(storeState),
}));

vi.mock('@/stores/usePanelSizeStore', () => ({
  usePanelSizeStore: <T,>(selector: (s: Record<string, unknown>) => T) => selector(storeState),
  RIGHT_PANEL_WIDTH_MIN: 260,
  RIGHT_PANEL_WIDTH_MAX: 480,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// The real handle drags the document; capture its props instead.
vi.mock('@/components/shared/PanelResizeHandle', () => ({
  PanelResizeHandle: (props: Record<string, unknown>) => {
    resizeHandleProps(props);
    return <div data-testid="resize-handle" />;
  },
}));

// Radix tooltips need a provider; pass the trigger child straight through.
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

vi.mock('@/components/shared/ErrorBoundary/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Render the headerAction so the flip button is reachable in the DOM, the
// same way the real panels mount it in their header strip.
vi.mock('@/components/lyrics/LyricsPanel/LyricsPanel', () => ({
  default: ({ headerAction }: { headerAction?: ReactNode }) => (
    <div data-testid="lyrics-panel">{headerAction}</div>
  ),
}));

vi.mock('@/components/player/QueuePanel/QueuePanel', () => ({
  default: ({ headerAction }: { headerAction?: ReactNode }) => (
    <div data-testid="queue-panel">{headerAction}</div>
  ),
}));

// ── Tests ──

describe('SidePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStoreState({});
    useLayoutStore.setState({ sidePanelSide: 'right', visualizerPosition: 'bottom' });
  });

  // 1. Content follows useViewStore.rightPanel
  it('renders the queue panel when rightPanel is queue', async () => {
    setStoreState({ rightPanel: 'queue' });
    render(<SidePanel side="right" />);

    expect(await screen.findByTestId('queue-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('lyrics-panel')).not.toBeInTheDocument();
  });

  it('renders the lyrics panel when rightPanel is lyrics', async () => {
    setStoreState({ rightPanel: 'lyrics' });
    render(<SidePanel side="right" />);

    expect(await screen.findByTestId('lyrics-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('queue-panel')).not.toBeInTheDocument();
  });

  // 2. Width comes from usePanelSizeStore
  it('applies the persisted panel width', () => {
    setStoreState({ rightPanelWidth: 411 });
    const { container } = render(<SidePanel side="right" />);

    const panel = container.firstElementChild as HTMLElement;
    expect(panel.style.width).toBe('411px');
  });

  // 3. Side-dependent chrome: border and resize-handle edge flip together
  it('docked right: inner border on the left, resize handle on the left edge', () => {
    const { container } = render(<SidePanel side="right" />);

    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('border-l');
    expect(panel.className).not.toContain('border-r');
    expect(resizeHandleProps).toHaveBeenCalledWith(expect.objectContaining({ edge: 'left' }));
  });

  it('docked left: inner border on the right, resize handle on the right edge', () => {
    const { container } = render(<SidePanel side="left" />);

    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('border-r');
    expect(panel.className).not.toContain('border-l');
    expect(resizeHandleProps).toHaveBeenCalledWith(expect.objectContaining({ edge: 'right' }));
  });

  // 4. Flip button updates useLayoutStore
  it('flips the panel to the left from the header button when docked right', async () => {
    const user = userEvent.setup();
    render(<SidePanel side="right" />);

    await user.click(await screen.findByRole('button', { name: 'movePanelLeft' }));
    expect(useLayoutStore.getState().sidePanelSide).toBe('left');
  });

  it('flips the panel back to the right when docked left', async () => {
    useLayoutStore.setState({ sidePanelSide: 'left' });
    const user = userEvent.setup();
    render(<SidePanel side="left" />);

    await user.click(await screen.findByRole('button', { name: 'movePanelRight' }));
    expect(useLayoutStore.getState().sidePanelSide).toBe('right');
  });

  // 5. The flip button reaches both panel contents via headerAction
  it('passes the flip button to the lyrics panel too', async () => {
    setStoreState({ rightPanel: 'lyrics' });
    render(<SidePanel side="right" />);

    expect(await screen.findByRole('button', { name: 'movePanelLeft' })).toBeInTheDocument();
  });

  // 6. Resize handle stays wired to the shared width setters
  it('passes the width setters and aria wiring to the resize handle', () => {
    render(<SidePanel side="right" />);

    expect(resizeHandleProps).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 320,
        min: 260,
        max: 480,
        onChange: setRightPanelWidth,
        onReset: resetRightPanelWidth,
        'aria-controls': 'player-side-panel',
      })
    );
  });

  // 7. Self-sufficiency guard: no chrome when there is nothing to show
  it('renders nothing when rightPanel is empty', () => {
    setStoreState({ rightPanel: null });
    const { container } = render(<SidePanel side="right" />);

    expect(container.firstElementChild).toBeNull();
  });
});
