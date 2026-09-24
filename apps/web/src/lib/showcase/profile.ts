/**
 * Showcase mode's browser profile: an in-memory `localStorage` seeded with a
 * settled demo profile.
 *
 * Replacing the storage rather than writing into it keeps showcase mode
 * hermetic both ways. A visit never changes the developer's own profile on the
 * same origin (onboarding, sidebar layout, language), and a leftover value from
 * an earlier visit can never change what a capture shows. Every load starts from
 * exactly this profile.
 */

/** `?lang=pl` picks the language; without it, the browser's own locale does. */
export const SHOWCASE_LANG_PARAM = 'lang';

const SUPPORTED = ['en', 'pl'];

function pickLanguage(): string {
  const requested = new URLSearchParams(window.location.search).get(SHOWCASE_LANG_PARAM);
  if (requested && SUPPORTED.includes(requested)) return requested;
  const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(browser) ? browser : 'en';
}

/** A persisted zustand bucket, in the `{ state, version }` shape the stores read. */
function bucket(state: Record<string, unknown>, version = 1): string {
  return JSON.stringify({ state, version });
}

function seedProfile(): Map<string, string> {
  return new Map<string, string>([
    ['shiranami.language', pickLanguage()],
    ['shiranami.onboarding', bucket({ hasCompletedOnboarding: true })],
    ['shiranami.supportBanner', bucket({ seen: true })],
    // Smart Playlists ships hidden; the showcase shows every view.
    ['shiranami.app-store', bucket({ sidebarHiddenItems: [], landingView: 'overview' })],
    ['shiranami.companion-store', bucket({ namingCeremonyDone: true })],
    [
      'shiranami.weather',
      bucket({ enabled: true, coords: { lat: 35.01, lon: 135.77, label: 'Kyoto' } }),
    ],
  ]);
}

class MemoryStorage implements Storage {
  constructor(private readonly items: Map<string, string>) {}

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.items.set(String(key), String(value));
  }
}

/** Swap `window.localStorage` for the seeded in-memory profile. */
export function installShowcaseProfile(): void {
  Object.defineProperty(window, 'localStorage', {
    value: new MemoryStorage(seedProfile()),
    configurable: true,
    enumerable: true,
    writable: false,
  });
}
