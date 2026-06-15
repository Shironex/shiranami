import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SlidersHorizontal } from 'lucide-react';

import SettingsHeader from './SettingsHeader';

describe('SettingsHeader', () => {
  it('renders the title and subtitle', () => {
    render(<SettingsHeader icon={SlidersHorizontal} title="Equalizer" subtitle="Shape playback" />);

    expect(screen.getByText('Equalizer')).toBeInTheDocument();
    expect(screen.getByText('Shape playback')).toBeInTheDocument();
  });
});
