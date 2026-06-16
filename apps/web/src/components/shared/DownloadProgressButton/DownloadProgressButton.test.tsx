import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DownloadProgressButton from './DownloadProgressButton';

describe('DownloadProgressButton', () => {
  it('fires onDownload from the interactive idle state', () => {
    const onDownload = vi.fn();
    render(
      <DownloadProgressButton status="idle" ariaLabel="Download track" onDownload={onDownload} />
    );

    const button = screen.getByRole('button', { name: 'Download track' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('marks the busy state as disabled and aria-busy while downloading', () => {
    const onDownload = vi.fn();
    render(
      <DownloadProgressButton
        status="downloading"
        ariaLabel="Downloading"
        onDownload={onDownload}
      />
    );

    const button = screen.getByRole('button', { name: 'Downloading' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('honors the force-disabled prop on an otherwise interactive idle button', () => {
    const onDownload = vi.fn();
    render(
      <DownloadProgressButton
        status="idle"
        ariaLabel="Download track"
        onDownload={onDownload}
        disabled
      />
    );

    expect(screen.getByRole('button', { name: 'Download track' })).toBeDisabled();
  });
});
