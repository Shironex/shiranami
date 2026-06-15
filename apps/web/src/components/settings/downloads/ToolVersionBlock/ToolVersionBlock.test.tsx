import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ToolVersionBlock from './ToolVersionBlock';

describe('ToolVersionBlock', () => {
  it('renders the installed version', () => {
    render(<ToolVersionBlock installedVersion="v2024.03.10" latestVersion={null} />);

    expect(screen.getByText('v2024.03.10')).toBeInTheDocument();
  });

  it('renders the latest release row when a latest version is provided', () => {
    render(<ToolVersionBlock installedVersion="v2024.03.10" latestVersion="v2024.04.01" />);

    expect(screen.getByText('v2024.04.01')).toBeInTheDocument();
  });
});
