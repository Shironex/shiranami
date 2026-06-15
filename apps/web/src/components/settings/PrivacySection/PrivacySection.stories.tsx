import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useTelemetryStore } from '@/stores/useTelemetryStore';

import PrivacySection from './PrivacySection';

/**
 * settings · PrivacySection. The crash-reporting panel: a "Send crash reports"
 * toggle that, when on, reveals a "Performance monitoring" toggle, plus
 * "What's sent" / "What's never sent" lists and a privacy note. A dev-only
 * "Verify setup" test-event card shows when reporting is on and no restart is
 * pending (Storybook runs in dev, so it appears in the enabled story). State
 * lives in `useTelemetryStore`.
 */
const meta: Meta<typeof PrivacySection> = {
  title: 'settings/PrivacySection',
  component: PrivacySection,
  // Both toggles are named via aria-labelledby, the card titles are real
  // headings, and the test-event control is a named button — axe clean.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div className="max-w-[640px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PrivacySection>;

/** Off — the card and toggle render; clicking it enables reporting in the store. */
export const Default: Story = {
  decorators: [
    Story => {
      useTelemetryStore.setState({
        enabled: false,
        performanceEnabled: false,
        bootEnabled: false,
        bootPerformanceEnabled: false,
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Crash reporting' })).toBeInTheDocument();

    // While off, the performance toggle is hidden.
    await expect(
      canvas.queryByRole('switch', { name: 'Performance monitoring' })
    ).not.toBeInTheDocument();

    // Enabling crash reporting writes through the store setter.
    const reports = canvas.getByRole('switch', { name: 'Send crash reports' });
    await expect(reports).not.toBeChecked();
    await userEvent.click(reports);
    await waitFor(() => expect(useTelemetryStore.getState().enabled).toBe(true));

    useTelemetryStore.setState({ enabled: false });
  },
};

/** Enabled — the performance toggle and the dev-only test card are revealed. */
export const Enabled: Story = {
  decorators: [
    Story => {
      useTelemetryStore.setState({
        enabled: true,
        performanceEnabled: true,
        bootEnabled: true,
        bootPerformanceEnabled: true,
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('switch', { name: 'Performance monitoring' })).toBeChecked();
    // Storybook runs in dev with reporting on and no pending restart, so the
    // "Verify setup" test card renders.
    await expect(canvas.getByRole('button', { name: 'Send test event' })).toBeInTheDocument();
  },
};
