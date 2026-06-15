import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccentStore, ACCENT_PRESETS } from '@/stores/useAccentStore';

import AccentColorPicker from './AccentColorPicker';

function reset(): void {
  useAccentStore.setState({ accentColor: null });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('AccentColorPicker', () => {
  it('marks "auto" as the active selection by default', () => {
    render(<AccentColorPicker />);

    expect(screen.getByRole('radio', { name: 'Auto (theme accent)' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('applies a preset accent when its swatch is clicked', async () => {
    const user = userEvent.setup();
    const setAccentColor = vi.fn();
    useAccentStore.setState({ setAccentColor });
    render(<AccentColorPicker />);

    const [firstPreset] = screen.getAllByRole('radio').slice(1);
    await user.click(firstPreset);

    expect(setAccentColor).toHaveBeenCalledWith(ACCENT_PRESETS[0].hex);
  });
});
