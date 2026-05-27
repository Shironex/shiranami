import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { TopBar } from './TopBar';
import type { AppView } from '@/stores/useViewStore';

let activeView: AppView = 'library';

vi.mock('@/stores/useViewStore', () => ({
  useViewStore: <T,>(selector: (s: Record<string, unknown>) => T) => selector({ activeView }),
}));
vi.mock('react-i18next', () => ({
  // Echo the requested key so we can assert which translation key the header used.
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useWindowControls', () => ({
  useWindowControls: () => ({
    isMaximized: false,
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
  }),
}));
vi.mock('@/hooks/useLibraryRescan', () => ({
  useLibraryRescan: () => ({ isScanning: false, rescan: vi.fn() }),
}));
vi.mock('@/lib/scanLock', () => ({ isScanLocked: () => false }));
vi.mock('@/lib/platform', () => ({ IS_ELECTRON: false, IS_MAC: false }));
vi.mock('@/lib/i18n', () => ({ SUPPORTED_LANGUAGES: [{ code: 'en' }], persistLanguage: vi.fn() }));

describe('TopBar page title', () => {
  it.each<[AppView, string]>([
    ['library', 'library'],
    ['settings', 'settings'],
    ['history', 'history'],
    ['mixes', 'mixes'],
  ])('renders the %s sidebar title key in the page heading', (view, expectedKey) => {
    activeView = view;
    render(<TopBar />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(expectedKey);
  });

  it('hides the page title on the now-playing view (it carries its own header)', () => {
    activeView = 'now-playing';
    render(<TopBar />);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});
