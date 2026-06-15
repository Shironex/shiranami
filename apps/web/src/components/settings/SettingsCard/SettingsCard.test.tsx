import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlidersHorizontal } from 'lucide-react';

import SettingsCard, { SettingsInfoCallout, SettingsToggleRow } from './SettingsCard';

describe('SettingsCard', () => {
  it('renders its title, subtitle, and children', () => {
    render(
      <SettingsCard icon={SlidersHorizontal} title="Equalizer" subtitle="Shape playback">
        <p>Body content</p>
      </SettingsCard>
    );

    expect(screen.getByRole('heading', { name: 'Equalizer' })).toBeInTheDocument();
    expect(screen.getByText('Shape playback')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('toggles via SettingsToggleRow', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <SettingsToggleRow
        label="Enable equalizer"
        checked={false}
        onCheckedChange={onCheckedChange}
      />
    );

    await user.click(screen.getByRole('switch', { name: 'Enable equalizer' }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('renders a SettingsInfoCallout note', () => {
    render(<SettingsInfoCallout icon={SlidersHorizontal}>Heads up</SettingsInfoCallout>);

    expect(screen.getByText('Heads up')).toBeInTheDocument();
  });
});
