import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLibraryStore } from '@/stores/useLibraryStore';

import ScanProgressCard from './ScanProgressCard';

function reset(): void {
  useLibraryStore.setState({ scanState: 'idle', scanProgress: null });
}

beforeEach(reset);
afterEach(reset);

describe('ScanProgressCard', () => {
  it('renders nothing while the scanner is idle', () => {
    const { container } = render(<ScanProgressCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the progress line and current file while scanning', () => {
    useLibraryStore.setState({
      scanState: 'scanning',
      scanProgress: { fileIndex: 3, fileCount: 10, currentFile: 'song.flac' },
    });
    render(<ScanProgressCard />);

    expect(screen.getByText(/Scanning 3 of 10/)).toBeInTheDocument();
    expect(screen.getByText(/song\.flac/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('disables the cancel button while cancelling', () => {
    useLibraryStore.setState({
      scanState: 'cancelling',
      scanProgress: { fileIndex: 3, fileCount: 10, currentFile: 'song.flac' },
    });
    render(<ScanProgressCard />);

    expect(screen.getByRole('button', { name: /Cancelling/ })).toBeDisabled();
  });
});
