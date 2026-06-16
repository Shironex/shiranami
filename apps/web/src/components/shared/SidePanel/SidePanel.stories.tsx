import type { Meta, StoryObj } from '@storybook/react-vite';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useViewStore } from '@/stores/useViewStore';
import { useLayoutStore } from '@/stores/useLayoutStore';

import SidePanel from './SidePanel';

/**
 * shared · SidePanel. The lyrics/queue panel docked beside the center views.
 * Whether it shows (and which content) lives in `useViewStore.rightPanel`; which
 * side it docks on lives in `useLayoutStore`; its one shared width lives in
 * `usePanelSizeStore`. Stories seed `rightPanel` so the panel chrome — the resize
 * handle, the flip-side button, and the lazy panel content — renders.
 */
const meta: Meta<typeof SidePanel> = {
  title: 'shared/SidePanel',
  component: SidePanel,
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="flex h-[36rem]">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SidePanel>;

/** Docked on the right with the queue panel showing. */
export const QueueRight: Story = {
  args: { side: 'right' },
  beforeEach: () => {
    useViewStore.setState({ rightPanel: 'queue' });
    useLayoutStore.setState({ sidePanelSide: 'right' });
  },
};

/** Docked on the left with the lyrics panel showing. */
export const LyricsLeft: Story = {
  args: { side: 'left' },
  beforeEach: () => {
    useViewStore.setState({ rightPanel: 'lyrics' });
    useLayoutStore.setState({ sidePanelSide: 'left' });
  },
};
