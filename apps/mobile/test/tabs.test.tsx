import { Text } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import type { AppEnv } from '@/lib/env';

const mockEnv: { current: AppEnv } = {
  current: { apiUrl: 'http://localhost:3000', apiKey: '', youtubeSearch: false },
};

jest.mock('@/lib/env', () => ({
  get env() {
    return mockEnv.current;
  },
}));

jest.mock('@/context/SettingsContext', () => ({
  useSettingsContext: () => ({
    settings: { showLabels: true, serverUrl: 'http://localhost:3000' },
    loaded: true,
    update: jest.fn(),
  }),
}));

jest.mock('@/components/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('@/components/player/MiniPlayer', () => ({ MiniPlayer: () => null }));

function placeholder(name: string) {
  return function Placeholder() {
    return <Text>{`${name} screen`}</Text>;
  };
}

async function renderTabs() {
  const TabsLayout = jest.requireActual('../app/(tabs)/_layout').default;
  await renderRouter(
    {
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': placeholder('Library'),
      '(tabs)/search': placeholder('Search'),
      '(tabs)/radio': placeholder('Radio'),
      '(tabs)/settings': placeholder('Settings'),
    },
    { initialUrl: '/' }
  );
}

describe('tabs', () => {
  it('hides the YouTube search tab while the flag is off', async () => {
    mockEnv.current = { ...mockEnv.current, youtubeSearch: false };
    await renderTabs();

    expect(screen.getByText('Library screen')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Library' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Radio' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Search' })).toBeNull();
  });

  it('shows the search tab when the flag is on', async () => {
    mockEnv.current = { ...mockEnv.current, youtubeSearch: true };
    await renderTabs();

    expect(screen.getByRole('tab', { name: 'Search' })).toBeTruthy();
  });
});
