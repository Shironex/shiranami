import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

import WindowControls from './WindowControls';

// Force the Windows-only chrome visible (the browser test env is not Electron,
// where the cluster would otherwise render nothing) and echo translation keys so
// we can assert the labelled controls render.
vi.mock('./WindowControls.hooks', () => ({
  useWindowControlsView: () => ({
    t: (key: string) => key,
    visible: true,
    isMaximized: false,
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
  }),
}));

describe('WindowControls', () => {
  it('renders the minimize, maximize, and close controls when visible', () => {
    render(<WindowControls />);

    expect(screen.getByRole('button', { name: 'minimize' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'maximize' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument();
  });
});
