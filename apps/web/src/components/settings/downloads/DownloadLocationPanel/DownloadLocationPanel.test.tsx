import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DownloadLocationPanel from './DownloadLocationPanel';

describe('DownloadLocationPanel', () => {
  it('renders the path and invokes onChange when the change button is pressed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DownloadLocationPanel
        pathDisplay="/Users/me/Music/Downloads"
        isDefault
        updating={false}
        onChange={onChange}
        onReset={() => {}}
      />
    );

    expect(screen.getByText('/Users/me/Music/Downloads')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('hides the reset button when the location is the default', () => {
    render(
      <DownloadLocationPanel
        pathDisplay="/Users/me/Music/Downloads"
        isDefault
        updating={false}
        onChange={() => {}}
        onReset={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
  });
});
