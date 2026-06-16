import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';

import ShareDialogManager from './ShareDialogManager';

describe('ShareDialogManager', () => {
  it('renders no dialog at rest', () => {
    render(<ShareDialogManager />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the share dialog when an open-share-dialog event fires', () => {
    render(<ShareDialogManager />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(DIALOG_EVENTS.openShare, { detail: { type: 'track', id: 'track-1' } })
      );
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Share Track')).toBeInTheDocument();
  });
});
