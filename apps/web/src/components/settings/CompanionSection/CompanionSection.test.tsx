import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CompanionSection from './CompanionSection';

describe('CompanionSection', () => {
  it('renders its label', () => {
    render(<CompanionSection />);
    expect(screen.getByText('CompanionSection')).toBeInTheDocument();
  });
});
