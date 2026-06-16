import type { Meta, StoryObj } from '@storybook/react-vite';
import { useSupportBannerStore } from '@/stores/useSupportBannerStore';
import SupportBanner from './SupportBanner';

/**
 * shared · SupportBanner. A thin, dismissible top-strip launch banner pointing
 * to Buy Me a Coffee + GitHub Sponsors. Renders only while the persisted `seen`
 * flag is false (acting on a link or dismissing marks it seen). Stories seed
 * `useSupportBannerStore`.
 */
const meta: Meta<typeof SupportBanner> = {
  title: 'shared/SupportBanner',
  component: SupportBanner,
};

export default meta;

type Story = StoryObj<typeof SupportBanner>;

/** Unseen — the banner is visible with its support links and dismiss control. */
export const Unseen: Story = {
  beforeEach: () => {
    useSupportBannerStore.setState({ seen: false });
  },
};

/** Already seen — the banner renders nothing. */
export const Seen: Story = {
  beforeEach: () => {
    useSupportBannerStore.setState({ seen: true });
  },
};
