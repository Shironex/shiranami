import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PreviewFrame from './PreviewFrame';

describe('PreviewFrame', () => {
  it('renders children on the canvas', () => {
    render(
      <PreviewFrame>
        <span>Mock content</span>
      </PreviewFrame>
    );

    expect(screen.getByText('Mock content')).toBeInTheDocument();
  });

  it('announces the canvas as a single labelled image', () => {
    render(
      <PreviewFrame label="Sample preview">
        <span>Mock content</span>
      </PreviewFrame>
    );

    expect(screen.getByRole('img', { name: 'Sample preview' })).toBeInTheDocument();
  });

  it('announces the frame itself when there is no canvas', () => {
    const { container } = render(
      <PreviewFrame label="Sample preview" size="none">
        <span>Mock content</span>
      </PreviewFrame>
    );

    const frame = container.firstElementChild;
    expect(frame).toHaveAttribute('role', 'img');
    expect(frame).toHaveAttribute('aria-label', 'Sample preview');
  });

  it('skips the image role entirely without a label', () => {
    render(
      <PreviewFrame>
        <span>Mock content</span>
      </PreviewFrame>
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the caption outside the labelled image', () => {
    render(
      <PreviewFrame label="Sample preview" caption="A footnote">
        <span>Mock content</span>
      </PreviewFrame>
    );

    const caption = screen.getByText('A footnote');
    expect(caption).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sample preview' })).not.toContainElement(caption);
  });

  it('merges canvas overrides through the size preset', () => {
    render(
      <PreviewFrame size="scene" canvasClassName="p-3 max-w-none">
        <span>Mock content</span>
      </PreviewFrame>
    );

    const canvas = screen.getByText('Mock content').parentElement;
    expect(canvas).toHaveClass('aspect-[5/2]', 'p-3', 'max-w-none');
    expect(canvas).not.toHaveClass('max-w-[360px]');
  });
});
