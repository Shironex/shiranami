import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SettingsPreview from './SettingsPreview';

describe('SettingsPreview', () => {
  it('renders the caption and children', () => {
    render(
      <SettingsPreview title="Preview">
        <span>Inner content</span>
      </SettingsPreview>
    );

    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('Inner content')).toBeInTheDocument();
  });
});
