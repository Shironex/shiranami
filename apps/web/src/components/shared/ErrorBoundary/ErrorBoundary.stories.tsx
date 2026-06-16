import type { Meta, StoryObj } from '@storybook/react-vite';
import ErrorBoundary from './ErrorBoundary';

/** Throws on mount so the boundary renders its fallback in stories. */
function Boom(): never {
  throw new Error('Something went wrong in this view');
}

/**
 * shared · ErrorBoundary. A class error boundary that catches a render crash in
 * its subtree and shows a recoverable fallback — a full-page card (`root`), a
 * view-sized card (default), or a compact inline strip (`compact`) for chrome
 * surfaces. Logs locally + captures to telemetry, and offers a "copy report"
 * affordance. Stories mount a throwing child so the fallback renders.
 */
const meta: Meta<typeof ErrorBoundary> = {
  title: 'shared/ErrorBoundary',
  component: ErrorBoundary,
};

export default meta;

type Story = StoryObj<typeof ErrorBoundary>;

/** Healthy subtree — the boundary is transparent and renders its children. */
export const Children: Story = {
  args: {
    viewName: 'Library',
    children: <div className="p-6 text-sm text-foreground">Child content renders normally.</div>,
  },
};

/** A crashed view — the boundary shows the view-sized fallback card. */
export const ViewFallback: Story = {
  args: {
    viewName: 'Library',
    children: <Boom />,
  },
};

/** Root crash — the full-page fallback with a "reload app" action. */
export const RootFallback: Story = {
  args: {
    root: true,
    viewName: 'App',
    children: <Boom />,
  },
};

/** Compact chrome-surface fallback — a single self-sized strip. */
export const CompactFallback: Story = {
  args: {
    compact: true,
    viewName: 'TopBar',
    children: <Boom />,
  },
};
