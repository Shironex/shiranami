import type { ReactNode } from 'react';
import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from '@/stores/useThemeStore';
import { useUIStore, UI_SCALE_DEFAULT } from '@/stores/useUIStore';
import {
  useThemeBgStore,
  THEME_BG_OPACITY_DEFAULT,
  THEME_BG_BLUR_DEFAULT,
  THEME_BG_DIM_DEFAULT,
} from '@/stores/useThemeBgStore';
import { OnboardingStepContext } from '../../stepContext';

import AppearanceStep from './AppearanceStep';

function renderStep(): void {
  const host = (children: ReactNode) => (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'appearance',
        kanji: '夜',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
  render(host(<AppearanceStep />));
}

beforeEach(() => {
  useThemeStore.setState({ theme: 'none' });
  useUIStore.setState({ uiScale: UI_SCALE_DEFAULT, lowPerformanceMode: false });
  useThemeBgStore.setState({
    bgOpacity: THEME_BG_OPACITY_DEFAULT,
    bgBlur: THEME_BG_BLUR_DEFAULT,
    bgDim: THEME_BG_DIM_DEFAULT,
  });
});

afterEach(() => {
  useThemeStore.setState({ theme: 'none' });
  useUIStore.setState({ uiScale: UI_SCALE_DEFAULT, lowPerformanceMode: false });
});

describe('AppearanceStep', () => {
  it('renders the eyebrow and the theme + comfort sections', () => {
    renderStep();

    expect(screen.getByText('03 · Make it yours')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Comfort')).toBeInTheDocument();
    expect(screen.getByText('Interface size')).toBeInTheDocument();
  });

  it('exposes the reduce-effects toggle', () => {
    renderStep();

    expect(screen.getByRole('switch', { name: 'Reduce effects' })).toBeInTheDocument();
  });

  it('renders the theme picker as a labelled radiogroup', () => {
    renderStep();

    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Apply None theme' })).toBeChecked();
  });

  it('hides the background-adjust sliders on the solid (none) theme', () => {
    renderStep();

    expect(screen.queryByRole('slider', { name: 'Blur' })).not.toBeInTheDocument();
  });

  it('reveals the background-adjust sliders for a photo theme', () => {
    useThemeStore.setState({ theme: 'snow' });
    renderStep();

    expect(screen.getByRole('slider', { name: 'Image opacity' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Blur' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Dim overlay' })).toBeInTheDocument();
  });

  it('writes the selected theme back through the theme store', async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole('radio', { name: 'Apply Snow theme' }));

    await waitFor(() => expect(useThemeStore.getState().theme).toBe('snow'));
  });
});
