import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';

import SidebarSection from './SidebarSection';

function reset(): void {
  useUIStore.setState({
    sidebarHiddenItems: [],
    sidebarOrder: [],
    sidebarPlaylistsVisible: true,
    landingView: 'overview',
  });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('SidebarSection', () => {
  it('renders the sidebar card with its reset control', () => {
    render(<SidebarSection />);

    expect(screen.getByRole('heading', { name: 'Sidebar' })).toBeInTheDocument();
  });

  it('resets the sidebar when the reset button is clicked', async () => {
    const user = userEvent.setup();
    const resetSidebar = vi.fn();
    useUIStore.setState({ resetSidebar });
    render(<SidebarSection />);

    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(resetSidebar).toHaveBeenCalled();
  });
});
