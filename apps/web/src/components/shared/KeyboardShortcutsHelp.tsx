import { useState, useEffect, useMemo } from 'react';
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
  action: string;
}

interface ShortcutCategory {
  title: string;
  shortcuts: Shortcut[];
}

function getShortcutCategories(): ShortcutCategory[] {
  return [
    {
      title: 'Playback',
      shortcuts: [
        { keys: ['Space'], action: 'Play / Pause' },
        { keys: ['N'], action: 'Next track' },
        { keys: ['P'], action: 'Previous track' },
        { keys: ['\u2190'], action: 'Seek back 5s' },
        { keys: ['\u2192'], action: 'Seek forward 5s' },
        { keys: ['Shift', '\u2190'], action: 'Seek back 10s' },
        { keys: ['Shift', '\u2192'], action: 'Seek forward 10s' },
        { keys: ['\u2191'], action: 'Volume up' },
        { keys: ['\u2193'], action: 'Volume down' },
        { keys: ['M'], action: 'Mute / Unmute' },
        { keys: ['S'], action: 'Toggle shuffle' },
        { keys: ['R'], action: 'Cycle repeat mode' },
        { keys: ['L'], action: 'Favorite track' },
      ],
    },
    {
      title: 'Navigation',
      shortcuts: [
        { keys: ['1'], action: 'Library' },
        { keys: ['2'], action: 'Playlists' },
        { keys: ['3'], action: 'Favorites' },
        { keys: ['4'], action: 'History' },
        { keys: ['5'], action: 'Download' },
        { keys: ['6'], action: 'Radio' },
        { keys: ['7'], action: 'Settings' },
        { keys: [MOD, 'K'], action: 'Command palette' },
      ],
    },
    {
      title: 'Panels & UI',
      shortcuts: [
        { keys: [MOD, 'B'], action: 'Toggle sidebar' },
        { keys: [MOD, 'L'], action: 'Toggle lyrics' },
        { keys: [MOD, 'Q'], action: 'Toggle queue' },
        { keys: [MOD, 'Shift', 'M'], action: 'Compact mode' },
        { keys: ['V'], action: 'Toggle visualizer' },
        { keys: ['?'], action: 'Show this help' },
        { keys: ['Esc'], action: 'Close panel' },
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

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
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
      <span className="text-sm text-muted-foreground">{shortcut.action}</span>
    </div>
  );
}

function CategorySection({ category }: { category: ShortcutCategory }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-foreground/80 mb-2 border-b border-border/30 pb-1">
        {category.title}
      </h3>
      <div className="space-y-0.5">
        {category.shortcuts.map((shortcut, i) => (
          <ShortcutRow key={i} shortcut={shortcut} />
        ))}
      </div>
    </div>
  );
}

function KeyboardShortcutsHelp() {
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
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2">
          {categories.map((category) => (
            <CategorySection key={category.title} category={category} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsHelp;
