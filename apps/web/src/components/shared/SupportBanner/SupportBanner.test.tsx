import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSupportBannerStore } from '@/stores/useSupportBannerStore';
import SupportBanner from './SupportBanner';

beforeEach(() => {
  useSupportBannerStore.setState({ seen: false });
});

afterEach(() => {
  useSupportBannerStore.setState({ seen: false });
});

describe('SupportBanner', () => {
  it('renders the support banner while unseen', () => {
    render(<SupportBanner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    // The two support links are present.
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(2);
  });

  it('renders nothing once seen', () => {
    useSupportBannerStore.setState({ seen: true });
    const { container } = render(<SupportBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
