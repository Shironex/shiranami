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

    expect(screen.getByRole('heading', { name: 'Heading' })).toHaveAttribute(
      'id',
      'onboarding-step-heading'
    );
  });
});
