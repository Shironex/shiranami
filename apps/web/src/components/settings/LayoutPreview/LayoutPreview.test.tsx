import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  useLayoutStore,
  SIDE_PANEL_SIDE_DEFAULT,
  VISUALIZER_POSITION_DEFAULT,
} from '@/stores/useLayoutStore';

import LayoutPreview from './LayoutPreview';

/** The side-panel mock is the only `w-9` block in the layout mock. */
const SIDE_PANEL = '.w-9';
/** The visualizer strip is the only block whose children are `w-1` bars. */
const VIZ_BAR = '.w-1';

function resetLayout(): void {
  useLayoutStore.setState({
    sidePanelSide: SIDE_PANEL_SIDE_DEFAULT,
    visualizerPosition: VISUALIZER_POSITION_DEFAULT,
  });
}

beforeEach(resetLayout);
afterEach(resetLayout);

describe('LayoutPreview', () => {
  it('labels the mock with the localized preview caption', () => {
    render(<LayoutPreview />);

    expect(screen.getByRole('img', { name: 'Layout preview' })).toBeInTheDocument();
  });

  it('renders the full visualizer bar strip', () => {
    const { container } = render(<LayoutPreview />);

    expect(container.querySelectorAll(VIZ_BAR)).toHaveLength(9);
  });

  it('docks the side panel left of the content area when the store says left', () => {
    useLayoutStore.setState({ sidePanelSide: 'left' });
    const { container } = render(<LayoutPreview />);

    const panel = container.querySelector(SIDE_PANEL);
    expect(panel).not.toBeNull();
    expect(panel?.previousElementSibling).toBeNull();
    expect(panel?.nextElementSibling).toHaveClass('flex-1');
  });

  it('docks the side panel right of the content area when the store says right', () => {
    useLayoutStore.setState({ sidePanelSide: 'right' });
    const { container } = render(<LayoutPreview />);

    const panel = container.querySelector(SIDE_PANEL);
    expect(panel).not.toBeNull();
    expect(panel?.nextElementSibling).toBeNull();
    expect(panel?.previousElementSibling).toHaveClass('flex-1');
  });

  it('renders exactly one side panel, never both slots at once', () => {
    const { container } = render(<LayoutPreview />);

    expect(container.querySelectorAll(SIDE_PANEL)).toHaveLength(1);
  });

  it('places the visualizer strip above the content row when docked top', () => {
    useLayoutStore.setState({ visualizerPosition: 'top' });
    const { container } = render(<LayoutPreview />);

    const strip = container.querySelector(VIZ_BAR)?.parentElement;
    // The content row (side panel + main area) is the only `min-h-0` sibling.
    expect(strip?.nextElementSibling).toHaveClass('min-h-0');
  });

  it('places the visualizer strip below the content row when docked bottom', () => {
    useLayoutStore.setState({ visualizerPosition: 'bottom' });
    const { container } = render(<LayoutPreview />);

    const strip = container.querySelector(VIZ_BAR)?.parentElement;
    expect(strip?.previousElementSibling).toHaveClass('min-h-0');
  });
});
