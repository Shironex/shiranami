import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useThemeStore, type ThemeId } from '@/stores/useThemeStore';
import { useUIStore } from '@/stores/useUIStore';
import { backgroundLibraryKeys, libraryOfRecord } from '@/hooks/queries/useBackgroundLibrary';
import type { CustomBackground } from '@shiranami/contracts/bindings';
import ThemeBackground from './ThemeBackground';

/**
 * shared · ThemeBackground. The full-bleed, z-0 theme image + WCAG scrim painted
 * beneath the shell. Seeded with a non-"none" theme so the layer renders (the
 * default "none" theme deliberately renders nothing).
 *
 * The `custom` stories seed the query directly rather than going through
 * `stream-urls`, whose base is only set inside the webview and is `null` here —
 * so they name a placeholder origin that will not load. What they demonstrate is
 * which *file* the layer resolved to, which is the decision this component owns.
 */
const meta: Meta<typeof ThemeBackground> = {
  title: 'shared/ThemeBackground',
  component: ThemeBackground,
};

export default meta;

type Story = StoryObj<typeof ThemeBackground>;

const ANIMATED: CustomBackground = {
  fileName: 'bg-abc.gif',
  stillFileName: 'bg-abc.still.jpg',
  width: 1920,
  height: 1080,
  animated: true,
};

function seeded(
  theme: ThemeId,
  record: CustomBackground | null,
  lowPerformanceMode = false
): NonNullable<Story['decorators']> {
  return [
    Story => {
      useThemeStore.setState({ theme });
      useUIStore.setState({ lowPerformanceMode });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      client.setQueryData(backgroundLibraryKeys.library, libraryOfRecord(record));
      return (
        <QueryClientProvider client={client}>
          <div className="relative w-full h-64">
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
  ];
}

/** A bundled theme: the committed WebP, unchanged by any of this. */
export const Default: Story = { decorators: seeded('lofi-night', null) };

/** An imported animation, playing — the state a user sees by default. */
export const CustomAnimated: Story = { decorators: seeded('custom', ANIMATED) };

/** The same import, frozen to its poster still by low-performance mode. */
export const CustomFrozen: Story = { decorators: seeded('custom', ANIMATED, true) };

/** An imported still image, which low-performance mode never affects. */
export const CustomStatic: Story = {
  decorators: seeded('custom', {
    ...ANIMATED,
    fileName: 'bg-abc.png',
    stillFileName: null,
    animated: false,
  }),
};

/** Custom selected with no image: renders nothing, rather than a bare scrim. */
export const CustomMissing: Story = { decorators: seeded('custom', null) };
