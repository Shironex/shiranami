import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
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

function StepHost({ children }: { children: ReactNode }) {
  return (
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
}

/**
 * Onboarding step 03 · Appearance. Picks a theme scene (a radiogroup of theme
 * tiles), sizes the interface (a slider + preset pills), toggles reduced
 * effects, and — once a photo theme is chosen — reveals opacity/blur/dim
 * background sliders. Reads/writes `useThemeStore`, `useUIStore`, and
 * `useThemeBgStore`; stories seed all three so the picker state is deterministic.
 */
const meta: Meta<typeof AppearanceStep> = {
  title: 'onboarding/AppearanceStep',
  component: AppearanceStep,
  parameters: {
    // Theme tiles form a labelled radiogroup of named radios; every slider
    // forwards its accessible name to the thumb (role="slider"); the
    // reduce-effects switch is aria-labelledby-bound — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <StepHost>
        <div className="h-[36rem] w-full">
          <Story />
        </div>
      </StepHost>
    ),
  ],
  beforeEach: () => {
    // Use the store action (not setState) so the data-theme attribute on <html>
    // is reset too — selecting a theme in a play test mutates the shared
    // document, and the returned teardown clears it so the global <html> never
    // bleeds the picked theme into the next story's axe contrast run.
    useThemeStore.getState().setTheme('none');
    useUIStore.setState({ uiScale: UI_SCALE_DEFAULT, lowPerformanceMode: false });
    useThemeBgStore.setState({
      bgOpacity: THEME_BG_OPACITY_DEFAULT,
      bgBlur: THEME_BG_BLUR_DEFAULT,
      bgDim: THEME_BG_DIM_DEFAULT,
    });
    return () => useThemeStore.getState().setTheme('none');
  },
};

export default meta;

type Story = StoryObj<typeof AppearanceStep>;

/** Solid (none) theme — theme radiogroup, size slider, no background sliders. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'The window dresses for your mood.' })
    ).toBeInTheDocument();
    await expect(canvas.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    await expect(canvas.getByRole('slider', { name: 'Interface size' })).toBeInTheDocument();
    await expect(canvas.getByRole('switch', { name: 'Reduce effects' })).toBeInTheDocument();
    // Background sliders only appear for a photo theme.
    await expect(canvas.queryByRole('slider', { name: 'Blur' })).not.toBeInTheDocument();
  },
};

/** Selecting a theme tile writes the choice through the theme store. */
export const SelectsTheme: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Apply Snow theme' }));

    await waitFor(() => expect(useThemeStore.getState().theme).toBe('snow'));
    // The photo theme reveals the background-adjust sliders.
    await expect(canvas.getByRole('slider', { name: 'Blur' })).toBeInTheDocument();
  },
};

/** A photo theme exposes the opacity/blur/dim background sliders. */
export const WithBackgroundAdjust: Story = {
  beforeEach: () => {
    useThemeStore.setState({ theme: 'snow' });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Apply Snow theme' })).toBeChecked();
    await expect(canvas.getByRole('slider', { name: 'Image opacity' })).toBeInTheDocument();
    await expect(canvas.getByRole('slider', { name: 'Blur' })).toBeInTheDocument();
    await expect(canvas.getByRole('slider', { name: 'Dim overlay' })).toBeInTheDocument();
  },
};
