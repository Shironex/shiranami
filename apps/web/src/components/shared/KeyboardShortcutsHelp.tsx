import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NAV_VIEWS } from '@/hooks/useKeyboardShortcuts';

const isMac = navigator.platform.toUpperCase().includes('MAC');
const MOD = isMac ? '\u2318' : 'Ctrl';

// Static film grain backdrop. Hoisted out of the JSX so the structural
// markup stays scannable; this string never changes per render.
const FILM_GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

interface Shortcut {
  keys: string[];
  actionKey: string;
}

interface ShortcutCategory {
  titleKey: string;
  glyph: string;
  shortcuts: Shortcut[];
}

// Returned as a keyed record (not an array) so consumers can destructure
// by name without depending on positional order. Adding or reordering
// categories here is now a compile-error if any consumer is missed.
interface ShortcutCategories {
  playback: ShortcutCategory;
  navigation: ShortcutCategory;
  panelsUi: ShortcutCategory;
}

function getShortcutCategories(): ShortcutCategories {
  return {
    playback: {
      titleKey: 'playback',
      glyph: '01',
      shortcuts: [
        { keys: ['Space'], actionKey: 'playPause' },
        { keys: ['N'], actionKey: 'nextTrack' },
        { keys: ['P'], actionKey: 'previousTrack' },
        { keys: ['\u2190'], actionKey: 'seekBack5s' },
        { keys: ['\u2192'], actionKey: 'seekForward5s' },
        { keys: ['Shift', '\u2190'], actionKey: 'seekBack10s' },
        { keys: ['Shift', '\u2192'], actionKey: 'seekForward10s' },
        { keys: ['\u2191'], actionKey: 'volumeUp' },
        { keys: ['\u2193'], actionKey: 'volumeDown' },
        { keys: ['M'], actionKey: 'muteUnmute' },
        { keys: ['S'], actionKey: 'toggleShuffle' },
        { keys: ['R'], actionKey: 'cycleRepeat' },
        { keys: ['L'], actionKey: 'favoriteTrack' },
      ],
    },
    navigation: {
      titleKey: 'navigation',
      glyph: '02',
      // Numeric nav entries are derived from NAV_VIEWS so the help dialog
      // can never drift out of sync with the keyboard handler again.
      shortcuts: [
        ...NAV_VIEWS.map((entry, i) => ({
          keys: [String(i + 1)],
          actionKey: entry.labelKey,
        })),
        { keys: [MOD, 'K'], actionKey: 'commandPalette' },
      ],
    },
    panelsUi: {
      titleKey: 'panelsUi',
      glyph: '03',
      shortcuts: [
        { keys: [MOD, 'B'], actionKey: 'toggleSidebar' },
        { keys: [MOD, 'L'], actionKey: 'toggleLyrics' },
        { keys: [MOD, 'Q'], actionKey: 'toggleQueue' },
        { keys: [MOD, 'Shift', 'M'], actionKey: 'compactMode' },
        { keys: [MOD, 'Shift', 'T'], actionKey: 'toggleAlwaysOnTop' },
        { keys: [MOD, 'Shift', 'P'], actionKey: 'toggleNowPlaying' },
        { keys: ['V'], actionKey: 'toggleVisualizer' },
        { keys: ['?'], actionKey: 'showHelp' },
        { keys: ['Esc'], actionKey: 'closePanel' },
      ],
    },
  };
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      className="
        relative inline-flex items-center justify-center
        min-w-[1.75rem] h-[1.6rem] px-[0.45rem]
        rounded-[0.4rem]
        font-mono text-[0.68rem] font-medium leading-none tracking-wide
        text-foreground/95
        bg-gradient-to-b from-white/[0.07] to-white/[0.015]
        border border-white/10
        shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09),0_2px_4px_-1px_rgba(0,0,0,0.55),0_1px_0_0_rgba(0,0,0,0.45)]
      "
    >
      {children}
    </kbd>
  );
}

function ShortcutRow({ shortcut, t }: { shortcut: Shortcut; t: (key: string) => string }) {
  return (
    <div
      className="
        group relative flex items-center justify-between gap-4
        py-[0.45rem] px-2.5 -mx-2.5 rounded-md
        transition-colors duration-200 ease-out
        hover:bg-white/[0.025]
      "
    >
      <span className="text-[0.78rem] text-foreground/65 group-hover:text-foreground/95 transition-colors duration-200">
        {t(shortcut.actionKey)}
      </span>
      <span className="flex items-center gap-1 shrink-0">
        {shortcut.keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-muted-foreground/40 text-[0.65rem] select-none">+</span>
            )}
            <Kbd>{key}</Kbd>
          </span>
        ))}
      </span>
    </div>
  );
}

function CategorySection({
  category,
  t,
}: {
  category: ShortcutCategory;
  t: (key: string) => string;
}) {
  return (
    <section className="relative">
      <header className="flex items-baseline gap-3 mb-3.5">
        <span className="font-mono text-[0.65rem] text-primary/60 tabular-nums tracking-[0.18em]">
          {category.glyph}
        </span>
        <h3 className="font-display text-[0.95rem] font-semibold text-foreground/95 tracking-tight">
          {t(category.titleKey)}
        </h3>
        <span
          aria-hidden
          className="flex-1 h-px bg-gradient-to-r from-border/60 via-border/25 to-transparent"
        />
      </header>
      <div>
        {category.shortcuts.map((shortcut, i) => (
          <ShortcutRow key={i} shortcut={shortcut} t={t} />
        ))}
      </div>
    </section>
  );
}

function KeyboardShortcutsHelp() {
  const { t } = useTranslation('shortcuts');
  const [open, setOpen] = useState(false);
  const { playback, navigation, panelsUi } = useMemo(() => getShortcutCategories(), []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-shortcut-help', handler);
    return () => window.removeEventListener('open-shortcut-help', handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="
          max-w-3xl max-h-[85vh] overflow-hidden
          p-0 gap-0
          border-white/[0.06]
        "
      >
        {/* Ambient aurora — soft violet bloom from top-left, brand bloom from bottom-right */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-primary/[0.12] blur-[120px]" />
          <div className="absolute -bottom-40 -right-16 w-[24rem] h-[24rem] rounded-full bg-brand-600/[0.10] blur-[110px]" />
        </div>

        {/* Film grain — keeps the cafe atmosphere from feeling sterile */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{ backgroundImage: FILM_GRAIN_SVG }}
        />

        <div className="relative">
          {/* Header — eyebrow + display title, no decorative icon */}
          <DialogHeader className="px-9 pt-8 pb-6 border-b border-white/[0.05]">
            <div className="space-y-1.5">
              <p className="font-display text-[0.7rem] font-medium tracking-[0.22em] uppercase text-primary/70">
                白波 &nbsp;·&nbsp; Shiranami
              </p>
              <DialogTitle className="font-display text-[1.55rem] font-semibold tracking-tight text-foreground leading-tight">
                {t('title')}
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* Asymmetric two-column reference layout:
              left = Playback (the tall column),
              right = Navigation stacked over Panels & UI */}
          <div
            className="
              px-9 py-8
              grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10
              max-h-[62vh] overflow-y-auto scrollbar-thin
            "
          >
            <div>
              <CategorySection category={playback} t={t} />
            </div>
            <div className="space-y-10">
              <CategorySection category={navigation} t={t} />
              <CategorySection category={panelsUi} t={t} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsHelp;
