import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import PanelResizeHandle from './PanelResizeHandle';

function renderHandle(overrides: Partial<React.ComponentProps<typeof PanelResizeHandle>> = {}) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  render(
    <PanelResizeHandle
      edge="right"
      value={320}
      min={240}
      max={480}
      onChange={onChange}
      onReset={onReset}
      aria-label="Resize panel"
      {...overrides}
    />
  );
  return { onChange, onReset };
}

describe('PanelResizeHandle', () => {
  it('renders a labelled separator exposing the current width', () => {
    renderHandle();

    const separator = screen.getByRole('separator', { name: 'Resize panel' });
    expect(separator).toHaveAttribute('aria-valuenow', '320');
    expect(separator).toHaveAttribute('aria-valuemin', '240');
    expect(separator).toHaveAttribute('aria-valuemax', '480');
  });

  it('grows a right-edge panel on ArrowRight, clamped to max', () => {
    const { onChange } = renderHandle({ value: 320 });

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith(336);
  });

  it('resets to the default width on Home', () => {
    const { onReset } = renderHandle();

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' });

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
