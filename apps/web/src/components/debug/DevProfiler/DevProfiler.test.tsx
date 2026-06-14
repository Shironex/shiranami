import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DevProfiler from './DevProfiler';

describe('DevProfiler', () => {
  it('renders its children', () => {
    render(
      <DevProfiler id="test">
        <span>profiled content</span>
      </DevProfiler>
    );

    expect(screen.getByText('profiled content')).toBeInTheDocument();
  });

  it('passes through arbitrary nested markup', () => {
    render(
      <DevProfiler id="nested">
        <div>
          <button type="button">click me</button>
        </div>
      </DevProfiler>
    );

    expect(screen.getByRole('button', { name: 'click me' })).toBeInTheDocument();
  });
});
