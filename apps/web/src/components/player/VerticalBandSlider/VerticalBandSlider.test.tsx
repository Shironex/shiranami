import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

import VerticalBandSlider from './VerticalBandSlider';
import type { IVerticalBandSliderProps } from './VerticalBandSlider.types';

function renderSlider(overrides: Partial<IVerticalBandSliderProps> = {}) {
  const props: IVerticalBandSliderProps = {
    freq: 1000,
    value: 0,
    onChange: vi.fn(),
    label: '1 kHz band',
    bandName: 'Presence',
    gainLabel: '0.0 dB',
    ...overrides,
  };
  const utils = render(
    <TooltipProvider>
      <VerticalBandSlider {...props} />
    </TooltipProvider>
  );
  return { ...utils, props };
}

describe('VerticalBandSlider', () => {
  it('renders a slider with the accessible label on its root', () => {
    const { container } = renderSlider();

    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(container.querySelector('[aria-label="1 kHz band"]')).toBeInTheDocument();
  });

  it('shows a kHz axis label for frequencies >= 1000', () => {
    renderSlider({ freq: 16000 });

    expect(screen.getByText('16k')).toBeInTheDocument();
  });

  it('shows the raw Hz axis label for frequencies < 1000', () => {
    renderSlider({ freq: 250 });

    expect(screen.getByText('250')).toBeInTheDocument();
  });

  it('forwards the unwrapped value to onChange when the slider moves', () => {
    const onChange = vi.fn();
    renderSlider({ onChange });

    const slider = screen.getByRole('slider');
    slider.focus();
    fireEvent.keyDown(slider, { key: 'ArrowUp' });

    expect(onChange).toHaveBeenCalled();
    expect(typeof onChange.mock.calls[0][0]).toBe('number');
  });

  it('marks the slider disabled when disabled is set', () => {
    renderSlider({ disabled: true });

    expect(screen.getByRole('slider')).toHaveAttribute('data-disabled');
  });
});
