import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSupportBannerStore } from '@/stores/useSupportBannerStore';

import SupportSection from './SupportSection';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SupportSection', () => {
  it('renders the support card with both call-to-action links', () => {
    render(<SupportSection />);

    expect(screen.getByRole('heading', { name: 'Support' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buy me a coffee/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sponsor on GitHub/ })).toBeInTheDocument();
  });

  it('marks the support banner as seen when a CTA is clicked', async () => {
    const user = userEvent.setup();
    const setSeen = vi.fn();
    useSupportBannerStore.setState({ setSeen });
    render(<SupportSection />);

    await user.click(screen.getByRole('link', { name: /Buy me a coffee/ }));

    expect(setSeen).toHaveBeenCalled();
  });
});
