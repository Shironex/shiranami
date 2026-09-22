import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart3, Clock3 } from 'lucide-react';

import StatsSection from './StatsSection';

describe('StatsSection', () => {
  it('renders a region named by its heading via aria-labelledby', () => {
    render(
      <StatsSection title="Recent Plays" icon={Clock3}>
        <p>rows</p>
      </StatsSection>
    );

    const region = screen.getByRole('region', { name: 'Recent Plays' });
    const heading = screen.getByRole('heading', { level: 2, name: 'Recent Plays' });
    expect(region).toHaveAttribute('aria-labelledby', heading.id);
  });

  it('renders the caption beneath the heading when provided', () => {
    render(
      <StatsSection title="Activity" icon={BarChart3} caption="Plays per day">
        <div />
      </StatsSection>
    );

    expect(screen.getByText('Plays per day')).toBeInTheDocument();
  });

  it('renders its children inside the section body', () => {
    render(
      <StatsSection title="Top Tracks" icon={BarChart3}>
        <p>Midnight study session</p>
      </StatsSection>
    );

    const region = screen.getByRole('region', { name: 'Top Tracks' });
    expect(region).toContainElement(screen.getByText('Midnight study session'));
  });

  it('renders the supplied icon, decorative and sized by the section', () => {
    const { container } = render(
      <StatsSection title="Activity" icon={BarChart3}>
        <div />
      </StatsSection>
    );

    const icon = container.querySelector('svg') as SVGElement;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon.getAttribute('class')).toContain('size-4');
  });

  it('promotes the hero variant with the primary-tinted chrome and icon chip', () => {
    render(
      <StatsSection title="Activity" icon={BarChart3} variant="hero" caption="Plays per day">
        <div />
      </StatsSection>
    );

    const region = screen.getByRole('region', { name: 'Activity' });
    expect(region.className).toContain('border-primary/20');
    expect(region.querySelector('.bg-primary\\/15')).not.toBeNull();
  });

  it('keeps the quiet panel chrome by default', () => {
    render(
      <StatsSection title="Top Artists" icon={BarChart3}>
        <div />
      </StatsSection>
    );

    const region = screen.getByRole('region', { name: 'Top Artists' });
    expect(region.className).toContain('border-border/25');
    expect(region.className).not.toContain('border-primary/20');
  });
});
