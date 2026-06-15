import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTelemetryStore } from '@/stores/useTelemetryStore';

import PrivacySection from './PrivacySection';

function reset(): void {
  useTelemetryStore.setState({
    enabled: false,
    performanceEnabled: false,
    bootEnabled: false,
    bootPerformanceEnabled: false,
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('PrivacySection', () => {
  it('renders the crash-reporting card and toggle', () => {
    render(<PrivacySection />);

    expect(screen.getByRole('heading', { name: 'Crash reporting' })).toBeInTheDocument();
    expect(screen.getByText('Send crash reports')).toBeInTheDocument();
  });

  it('toggles crash reporting through the store setter', async () => {
    const user = userEvent.setup();
    const setEnabled = vi.fn();
    useTelemetryStore.setState({ setEnabled });
    render(<PrivacySection />);

    await user.click(screen.getByRole('switch', { name: 'Send crash reports' }));

    expect(setEnabled).toHaveBeenCalledWith(true);
  });
});
