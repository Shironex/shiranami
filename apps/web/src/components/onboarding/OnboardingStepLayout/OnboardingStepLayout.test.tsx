import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OnboardingStepLayout from './OnboardingStepLayout';

describe('OnboardingStepLayout', () => {
  it('renders the eyebrow, headline, description, and control', () => {
    render(
      <OnboardingStepLayout
        kanji="蔵"
        stepMarker="01 · FILES"
        headline="Point at your music"
        description="Add the folders that hold your library."
      >
        <button type="button">Add folder</button>
      </OnboardingStepLayout>
    );

    expect(screen.getByText('01 · FILES')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Point at your music' })).toBeInTheDocument();
    expect(screen.getByText('Add the folders that hold your library.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add folder' })).toBeInTheDocument();
  });

  it('wires the heading id so the wizard can move focus to it', () => {
    render(
      <OnboardingStepLayout
        kanji="蔵"
        stepMarker="01"
        headline="Heading"
        description="Body"
        headingId="onboarding-step-heading"
      >
        <span>control</span>
      </OnboardingStepLayout>
    );

    const heading = screen.getByRole('heading', { name: 'Heading' });
    expect(heading).toHaveAttribute('id', 'onboarding-step-heading');
    // The heading is programmatically focusable so the wizard can move focus to
    // it on each step change without it being a tab stop.
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('renders an emphasised headline as a single accessible name', () => {
    render(
      <OnboardingStepLayout
        kanji="蔵"
        stepMarker="01"
        headline={
          <>
            Point at your <em className="not-italic">music</em>
          </>
        }
        description="Body"
      >
        <span>control</span>
      </OnboardingStepLayout>
    );

    // The <em> accent must not split the heading's accessible name.
    expect(screen.getByRole('heading', { name: 'Point at your music' })).toBeInTheDocument();
  });
});
