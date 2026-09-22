import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import TopBar from './TopBar';
import type { AppView } from '@/stores/useViewStore';

let activeView: AppView = 'library';
const changeLanguage = vi.fn();
const persistLanguage = vi.fn();

vi.mock('@/stores/useViewStore', () => ({
  useViewStore: <T,>(selector: (s: Record<string, unknown>) => T) => selector({ activeView }),
}));
vi.mock('@/stores/useInterfaceStore', () => ({
  useInterfaceStore: <T,>(selector: (s: Record<string, unknown>) => T) =>
    selector({ topBarLanguageSwitcher: true }),
}));
vi.mock('react-i18next', () => ({
  // Echo the requested key so we can assert which translation key the header used.
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage } }),
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
vi.mock('@/lib/i18n', () => ({
  SUPPORTED_LANGUAGES: [
    { code: 'en', label: 'English' },
    { code: 'pl', label: 'Polski' },
  ],
  persistLanguage: (lang: string) => persistLanguage(lang),
}));

beforeEach(() => {
  changeLanguage.mockClear();
  persistLanguage.mockClear();
});

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

describe('TopBar add dropdown', () => {
  it('opens a menu from the trigger and fires the add actions', async () => {
    activeView = 'library';
    const user = userEvent.setup();
    const onAddFolder = vi.fn();
    render(<TopBar onAddFolder={onAddFolder} />);

    const trigger = screen.getByRole('button', { name: 'add' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'add' })).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: 'addFolder' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'addFile' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'rescan' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'addFolder' }));

    expect(onAddFolder).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('supports arrow-key navigation and closes on Escape', async () => {
    activeView = 'library';
    const user = userEvent.setup();
    render(<TopBar />);

    await user.click(screen.getByRole('button', { name: 'add' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'addFolder' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('TopBar language segmented control', () => {
  it('exposes a radiogroup with the active language checked', () => {
    activeView = 'library';
    render(<TopBar />);

    const group = screen.getByRole('radiogroup', { name: 'language.label' });
    const radios = screen.getAllByRole('radio');
    expect(group).toBeInTheDocument();
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Polski' })).not.toBeChecked();
  });

  it('switches and persists the language on click', async () => {
    activeView = 'library';
    const user = userEvent.setup();
    render(<TopBar />);

    await user.click(screen.getByRole('radio', { name: 'Polski' }));

    expect(changeLanguage).toHaveBeenCalledWith('pl');
    expect(persistLanguage).toHaveBeenCalledWith('pl');
  });

  it('moves selection with arrow keys, selection following focus', async () => {
    activeView = 'library';
    const user = userEvent.setup();
    render(<TopBar />);

    const english = screen.getByRole('radio', { name: 'English' });
    english.focus();
    await user.keyboard('{ArrowRight}');

    expect(changeLanguage).toHaveBeenCalledWith('pl');
    expect(persistLanguage).toHaveBeenCalledWith('pl');
    expect(screen.getByRole('radio', { name: 'Polski' })).toHaveFocus();
  });
});
