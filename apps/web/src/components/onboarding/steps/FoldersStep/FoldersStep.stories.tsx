import type { ReactNode } from 'react';
import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { OnboardingStepContext } from '../../stepContext';

import FoldersStep from './FoldersStep';

function StepHost({ children }: { children: ReactNode }) {
  return (
    <OnboardingStepContext.Provider
      value={{
        stepId: 'folders',
        kanji: '蔵',
        headingId: 'onboarding-step-heading',
        headingRef: createRef<HTMLHeadingElement>(),
      }}
    >
      {children}
    </OnboardingStepContext.Provider>
  );
}

/**
 * Onboarding step 01 · Folders. Lets the user point Shiranami at the directories
 * that become their library — an "Add folder" control over a live folder list
 * (empty by default) and an inline scan-progress card. Folders come from
 * `useFoldersQuery` (no backend in stories, so the list starts empty); the
 * add-folder picker is desktop-gated, so in the web preview it's disabled
 * beside a "desktop-only" notice.
 */
const meta: Meta<typeof FoldersStep> = {
  title: 'onboarding/FoldersStep',
  component: FoldersStep,
  parameters: {
    // The add-folder control is a named button; the empty-state and desktop-only
    // copy are plain paragraphs; the folder glyph is decorative — axe passes
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

type Story = StoryObj<typeof FoldersStep>;

/** Empty library in the web preview — empty-state copy and the desktop-only notice. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Your folders are the catalog.' })
    ).toBeInTheDocument();
    await expect(canvas.getByText('Music folders')).toBeInTheDocument();
    await expect(
      canvas.getByText('No folders yet. Add one to start building your library.')
    ).toBeInTheDocument();

    // The Storybook web preview is non-Electron, so the picker is disabled and a
    // desktop-only notice explains why.
    await expect(canvas.getByRole('button', { name: 'Add folder' })).toBeDisabled();
    await expect(
      canvas.getByText('Adding folders is available in the desktop app.')
    ).toBeInTheDocument();
  },
};
