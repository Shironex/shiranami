import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInterfaceStore, INTERFACE_DEFAULTS } from '@/stores/useInterfaceStore';

import InterfaceSection from './InterfaceSection';

function reset(): void {
  useInterfaceStore.setState({ ...INTERFACE_DEFAULTS });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('InterfaceSection', () => {
  it('renders the layout, top bar, overview, and player cards', () => {
    render(<InterfaceSection />);

    expect(screen.getByRole('heading', { name: 'Panel layout' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Overview widgets' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Player bar' })).toBeInTheDocument();
  });

  it('toggles an interface element when its switch is clicked', async () => {
    const user = userEvent.setup();
    const setVisible = vi.fn();
    useInterfaceStore.setState({ setVisible });
    render(<InterfaceSection />);

    await user.click(screen.getAllByRole('switch')[0]);

    expect(setVisible).toHaveBeenCalled();
  });
});
