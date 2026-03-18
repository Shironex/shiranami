import { cn } from '@/lib/utils';
import { IS_MAC } from '@/lib/platform';
import { useAppStore, type AppView } from '@/stores/useAppStore';
import { Library, Heart, ListMusic, Search, Settings } from 'lucide-react';
import { motion } from 'motion/react';

const NAV_ITEMS: Array<{ id: AppView; label: string; icon: typeof Library }> = [
  { id: 'library', label: 'Library', icon: Library },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'favorites', label: 'Favorites', icon: Heart },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const activeView = useAppStore(s => s.activeView);
  const navigateTo = useAppStore(s => s.navigateTo);

  return (
    <div className="w-[200px] shrink-0 flex flex-col h-full bg-sidebar border-r border-border/50">
      {/* Logo area - also serves as drag region */}
      <div className={cn('drag h-14 flex items-center px-5 gap-2.5 shrink-0', IS_MAC && 'pt-8')}>
        <img src="./mascot.png" alt="" className="no-drag w-7 h-7 rounded-lg object-cover" draggable={false} />
        <span className="no-drag font-display font-semibold text-sm text-foreground tracking-tight">
          Shiranami
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2">
        <div className="space-y-0.5">
          {NAV_ITEMS.map(item => {
            const isActive = activeView === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 relative',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 bg-accent rounded-xl"
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  />
                )}
                <Icon className="w-4 h-4 relative z-10" />
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Bottom decoration */}
      <div className="px-5 py-4 border-t border-border/30">
        <p className="text-[10px] text-muted-foreground/40 font-medium tracking-wider uppercase">
          白波 v0.1.0
        </p>
      </div>
    </div>
  );
}
