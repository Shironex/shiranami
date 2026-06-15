import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SidebarPreview from './SidebarPreview';

describe('SidebarPreview', () => {
  it('renders the sidebar preview mock', () => {
    render(<SidebarPreview />);

    expect(screen.getByRole('img', { name: 'Preview' })).toBeInTheDocument();
  });
});
