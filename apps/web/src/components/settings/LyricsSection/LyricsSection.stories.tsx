import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  useLyricsAppearanceStore,
  LYRICS_PLAIN_OPACITY_DEFAULT,
  LYRICS_PLAIN_FONT_SIZE_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
  LYRICS_SYNCED_FONT_SIZE_DEFAULT,
} from '@/stores/useLyricsAppearanceStore';

import LyricsSection from './LyricsSection';

const meta: Meta<typeof LyricsSection> = {
  title: 'settings/LyricsSection',
  component: LyricsSection,
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LyricsSection>;

export const Default: Story = {
  decorators: [
    Story => {
      useLyricsAppearanceStore.setState({
        lyricsPlainOpacity: LYRICS_PLAIN_OPACITY_DEFAULT,
        lyricsPlainFontSize: LYRICS_PLAIN_FONT_SIZE_DEFAULT,
        lyricsSyncedDimOpacity: LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
        lyricsSyncedFontSize: LYRICS_SYNCED_FONT_SIZE_DEFAULT,
      });
      return <Story />;
    },
  ],
};

export const Customized: Story = {
  decorators: [
    Story => {
      useLyricsAppearanceStore.setState({
        lyricsPlainOpacity: 0.7,
        lyricsPlainFontSize: 'lg',
        lyricsSyncedDimOpacity: 0.3,
        lyricsSyncedFontSize: 'xl',
      });
      return <Story />;
    },
  ],
};
