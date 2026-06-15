import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { systemPrefsKeys, type SystemPrefs } from '@/hooks/queries/useSystemPrefs';

import SystemSection from './SystemSection';

function renderWithPrefs(prefs?: SystemPrefs): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (prefs) {
    client.setQueryData<SystemPrefs>(systemPrefsKeys.all, prefs);
  }
  render(
    <QueryClientProvider client={client}>
      <SystemSection />
    </QueryClientProvider>
  );
}

describe('SystemSection', () => {
  it('renders the system behavior toggle rows', () => {
    renderWithPrefs({ launchAtStartup: true, minimizeToTray: false, closeToTray: false });

    expect(screen.getByText('System behavior')).toBeInTheDocument();
    expect(screen.getByText('Launch at startup')).toBeInTheDocument();
    expect(screen.getByText('Minimize to tray')).toBeInTheDocument();
    expect(screen.getByText('Close to tray')).toBeInTheDocument();
  });

  it('reflects the stored checked state on each toggle', () => {
    renderWithPrefs({ launchAtStartup: true, minimizeToTray: false, closeToTray: false });

    const [launch, minimize, close] = screen.getAllByRole('switch');
    expect(launch).toBeChecked();
    expect(minimize).not.toBeChecked();
    expect(close).not.toBeChecked();
  });
});
