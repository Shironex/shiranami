import type { ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTelemetryStore } from '@/stores/useTelemetryStore';
import { OnboardingStepContext } from '../../stepContext';

import PrivacyStep from './PrivacyStep';

function renderStep(): void {
  const host = (children: ReactNode) => (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'privacy',
        kanji: '守',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
  render(host(<PrivacyStep />));
}

beforeEach(() => {
  useTelemetryStore.setState({ enabled: false, performanceEnabled: false });
});

afterEach(() => {
  useTelemetryStore.setState({ enabled: false, performanceEnabled: false });
});

describe('PrivacyStep', () => {
  it('renders the eyebrow and the sent/not-sent disclosure columns', () => {
    renderStep();

    expect(screen.getByText('06 · Crash reports')).toBeInTheDocument();
    expect(screen.getByText("What's sent")).toBeInTheDocument();
    expect(screen.getByText("What's never sent")).toBeInTheDocument();
    expect(screen.getByText('Send crash reports')).toBeInTheDocument();
  });

  it('lists every sent and never-sent disclosure item', () => {
    renderStep();

    expect(screen.getByText('Crash and error reports')).toBeInTheDocument();
    expect(screen.getByText('No screen recording or replay')).toBeInTheDocument();
    expect(screen.getByText('No username in file paths')).toBeInTheDocument();
  });

  it('hides the performance toggle until crash reporting is enabled', () => {
    renderStep();

    expect(
      screen.queryByRole('switch', { name: 'Performance monitoring' })
    ).not.toBeInTheDocument();
  });

  it('reveals the performance toggle once reporting is on', () => {
    useTelemetryStore.setState({ enabled: true });
    renderStep();

    expect(screen.getByRole('switch', { name: 'Performance monitoring' })).toBeInTheDocument();
  });

  it('writes the crash-reporting opt-in back through the telemetry store', async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole('switch', { name: 'Send crash reports' }));

    await waitFor(() => expect(useTelemetryStore.getState().enabled).toBe(true));
  });
});
