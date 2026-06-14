import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HistoryEmptyState from './HistoryEmptyState';

describe('HistoryEmptyState', () => {
  it('renders the title and copy', () => {
    render(<HistoryEmptyState title="No activity yet" copy="Play a few tracks to see this." />);

    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    expect(screen.getByText('Play a few tracks to see this.')).toBeInTheDocument();
  });
});
