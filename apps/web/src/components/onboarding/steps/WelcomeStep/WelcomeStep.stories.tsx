import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect } from 'storybook/test';
import { OnboardingStepContext } from '../../stepContext';

import WelcomeStep from './WelcomeStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'welcome',
        kanji: '白波',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
}

/**
 * Onboarding step 00 · Welcome. The wizard's opening pane: a versioned eyebrow,
 * the brand headline, the breathing mascot ring with the Shiranami wordmark, and
 * the one control the step actually owns — an interface-language picker whose
 * pills apply the language immediately (the whole wizard re-renders) and persist
 * it for the next launch. The preview's per-story locale loader resets the
 * language before each story, so switching it in a play function is contained.
 */
const meta: Meta<typeof WelcomeStep> = {
  title: 'onboarding/WelcomeStep',
  component: WelcomeStep,
  parameters: {
    // Language pills are named toggle buttons carrying aria-pressed, the mascot
    // has real alt text, and the brand ring layers are aria-hidden — axe passes
    // clean.
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
};

export default meta;

type Story = StoryObj<typeof WelcomeStep>;

/** Headroom for the async locale-bundle fetch a language switch triggers. */
const LOCALE_LOAD_TIMEOUT_MS = 10_000;

/** English active — headline, mascot, and both language pills. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'A softer place for your music library.' })
    ).toBeInTheDocument();
    await expect(canvas.getByRole('img', { name: 'Shiranami mascot' })).toBeInTheDocument();
    await expect(canvas.getByText(/late night build/)).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(canvas.getByRole('button', { name: 'Polski' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  },
};

/** Picking Polski re-renders the step in Polish and moves the pressed state. */
export const SwitchesLanguage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Polski' }));

    // Applying the language kicks off an async i18next locale-bundle fetch, so the
    // Polish copy lands a render later — measured just past `findBy*`'s 1s default
    // on a cold bundle. Wait on it explicitly instead of racing the default.
    await expect(
      await canvas.findByText(
        'Możesz to zmienić w każdej chwili w Ustawienia · Wygląd.',
        {},
        { timeout: LOCALE_LOAD_TIMEOUT_MS }
      )
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Polski' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // The settings namespace follows the switch too.
    await expect(
      await canvas.findByRole(
        'img',
        { name: 'Maskotka Shiranami' },
        { timeout: LOCALE_LOAD_TIMEOUT_MS }
      )
    ).toBeInTheDocument();
  },
};
