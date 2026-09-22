import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import PreviewFrame from './PreviewFrame';

/**
 * settings · PreviewFrame. The one preview surface every settings mock sits
 * on: frosted frame + optional canvas with a geometry preset (`scene`,
 * `shell`, `auto`, `none`) + optional caption slot. Every `*Preview`
 * component renders through it so the previews share one calm rhythm.
 */
const meta: Meta<typeof PreviewFrame> = {
  title: 'settings/PreviewFrame',
  component: PreviewFrame,
  parameters: {
    // The mock is a labelled image; the caption is plain text — axe clean.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Content-sized canvas — the default for card and meter mocks. */
export const Default: Story = {
  args: {
    label: 'Sample preview',
    canvasClassName: 'p-3',
    children: (
      <div className="space-y-2">
        <div className="h-2.5 w-28 rounded-full bg-foreground/25" />
        <div className="h-2 w-20 rounded-full bg-muted-foreground/25" />
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Sample preview' })).toBeInTheDocument();
  },
};

/** Fixed-aspect scene canvas used by the illustrative moodbox mocks. */
export const Scene: Story = {
  args: {
    label: 'Scene preview',
    size: 'scene',
    canvasClassName: 'p-3',
    children: (
      <div className="flex h-full flex-col justify-end gap-2">
        <div className="h-2 w-28 rounded-full bg-foreground/25" />
        <div className="h-1.5 w-20 rounded-full bg-muted-foreground/25" />
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Scene preview' })).toBeInTheDocument();
  },
};

/** Caption slot under the canvas, outside the announced image. */
export const WithCaption: Story = {
  args: {
    label: 'Captioned preview',
    caption: 'A short footnote about the mock.',
    canvasClassName: 'p-3',
    children: <div className="h-8 rounded-lg bg-muted/30" />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('A short footnote about the mock.')).toBeInTheDocument();
  },
};

/** `size="none"`: the frame is the image and children draw their own surface. */
export const FrameOnly: Story = {
  args: {
    label: 'Frame-only preview',
    size: 'none',
    children: (
      <div className="mx-auto max-w-[360px] rounded-xl border border-border/25 bg-surface/60 p-3">
        <div className="h-2.5 w-24 rounded-full bg-foreground/25" />
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Frame-only preview' })).toBeInTheDocument();
  },
};
