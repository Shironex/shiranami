import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Clock3, Music4 } from 'lucide-react';

import HistoryStatCard from './HistoryStatCard';

describe('HistoryStatCard', () => {
  it('renders the label, figure and hint the history hook already formatted', () => {
    render(
      <HistoryStatCard label="Total plays" value="1,204" hint="Across 88 tracks" icon={Music4} />
    );

    expect(screen.getByText('Total plays')).toBeInTheDocument();
    expect(screen.getByText('1,204')).toBeInTheDocument();
    expect(screen.getByText('Across 88 tracks')).toBeInTheDocument();
  });

  it('renders the supplied icon, decorative and sized by the card', () => {
    const { container } = render(
      <HistoryStatCard label="Listening time" value="9h 20m" hint="This week" icon={Clock3} />
    );

    const icon = container.querySelector('svg') as SVGElement;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon.getAttribute('class')).toContain('size-4');
    expect(icon.getAttribute('class')).toMatch(/lucide-clock/);
  });

  it('renders the value verbatim, including a zero figure', () => {
    render(<HistoryStatCard label="Total plays" value="0" hint="Nothing yet" icon={Music4} />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('keeps the label above the figure and the hint below it', () => {
    render(
      <HistoryStatCard label="Unique artists" value="42" hint="Since you started" icon={Music4} />
    );

    const card = screen.getByText('42').parentElement as HTMLElement;
    const lines = Array.from(card.querySelectorAll('span, p')).map(node => node.textContent);
    expect(lines).toEqual(['Unique artists', '42', 'Since you started']);
  });

  it('renders no interactive surface — the card is a static figure', () => {
    render(
      <HistoryStatCard label="Unique artists" value="42" hint="Since you started" icon={Music4} />
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
