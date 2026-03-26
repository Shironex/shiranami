import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const isMac = navigator.platform.toUpperCase().includes('MAC');
const MOD = isMac ? '\u2318' : 'Ctrl';

interface Shortcut {
  keys: string[];
  actionKey: string;
}

interface ShortcutCategory {
  titleKey: string;
  shortcuts: Shortcut[];
}

function getShortcutCategories(): ShortcutCategory[] {
  return [
    {
      titleKey: 'playback',
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
    {
      titleKey: 'navigation',
      shortcuts: [
        { keys: ['1'], actionKey: 'library' },
        { keys: ['2'], actionKey: 'playlists' },
        { keys: ['3'], actionKey: 'favorites' },
        { keys: ['4'], actionKey: 'history' },
        { keys: ['5'], actionKey: 'download' },
        { keys: ['6'], actionKey: 'radio' },
        { keys: ['7'], actionKey: 'settings' },
        { keys: [MOD, 'K'], actionKey: 'commandPalette' },
      ],
    },
    {
      titleKey: 'panelsUi',
      shortcuts: [
        { keys: [MOD, 'B'], actionKey: 'toggleSidebar' },
        { keys: [MOD, 'L'], actionKey: 'toggleLyrics' },
        { keys: [MOD, 'Q'], actionKey: 'toggleQueue' },
        { keys: [MOD, 'Shift', 'M'], actionKey: 'compactMode' },
        { keys: ['V'], actionKey: 'toggleVisualizer' },
        { keys: ['?'], actionKey: 'showHelp' },
        { keys: ['Esc'], actionKey: 'closePanel' },
      ],
    },
  ];
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="px-2 py-0.5 rounded-md bg-muted border border-border/50 text-xs font-mono text-foreground/90">
      {children}
    </kbd>
  );
}

function ShortcutRow({ shortcut, t }: { shortcut: Shortcut; t: (key: string) => string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="flex items-center gap-1 shrink-0">
        {shortcut.keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
            <Kbd>{key}</Kbd>
          </span>
        ))}
      </span>
      <span className="text-sm text-muted-foreground">{t(shortcut.actionKey)}</span>
    </div>
  );
}

function CategorySection({ category, t }: { category: ShortcutCategory; t: (key: string) => string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-foreground/80 mb-2 border-b border-border/30 pb-1">
        {t(category.titleKey)}
      </h3>
      <div className="space-y-0.5">
        {category.shortcuts.map((shortcut, i) => (
          <ShortcutRow key={i} shortcut={shortcut} t={t} />
        ))}
      </div>
    </div>
  );
}

function KeyboardShortcutsHelp() {
  const { t } = useTranslation('shortcuts');
  const [open, setOpen] = useState(false);
  const categories = useMemo(() => getShortcutCategories(), []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-shortcut-help', handler);
    return () => window.removeEventListener('open-shortcut-help', handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2">
          {categories.map((category) => (
            <CategorySection key={category.titleKey} category={category} t={t} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsHelp;
