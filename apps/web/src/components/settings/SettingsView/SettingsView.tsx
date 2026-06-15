import { cn } from '@/lib/utils';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import { useSettingsView } from './SettingsView.hooks';

export default function SettingsView() {
  const { t, activeSection, activeEntry, Panel, navGroups, sectionsAriaLabel, onSelectSection } =
    useSettingsView();

  const navGroupNodes = navGroups.map(group => {
    const itemNodes = group.items.map(section => {
      const isActive = activeSection === section.id;
      const Icon = section.Icon;
      return (
        <button
          key={section.id}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => onSelectSection(section.id)}
          title={t(section.labelKey)}
          className={cn(
            'relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm',
            'transition-all duration-150',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            isActive
              ? 'bg-primary/15 text-primary font-medium shadow-[inset_0_0_12px_-6px_rgba(var(--primary-rgb),0.5)]'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground/80'
          )}
        >
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-primary"
            />
          )}
          <Icon className="w-4 h-4 shrink-0" />
          <span className="min-w-0 truncate whitespace-nowrap">{t(section.labelKey)}</span>
        </button>
      );
    });
    return (
      <div key={group.group} className="mb-1.5">
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/80 px-3 mb-1.5 mt-3 first:mt-0">
          {group.label}
        </div>
        {itemNodes}
      </div>
    );
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SettingsHeader
        icon={activeEntry.Icon}
        title={t(activeEntry.labelKey)}
        subtitle={t(activeEntry.subtitleKey)}
      />
      <div className="flex-1 min-h-0 px-4 pb-4 overflow-hidden">
        <div className="flex h-full rounded-2xl glass border border-border/30 overflow-hidden">
          {/* Section navigation */}
          <nav
            className="w-48 shrink-0 border-r border-border/40 p-3 overflow-y-auto scrollbar-thin min-h-0"
            aria-label={sectionsAriaLabel}
          >
            {navGroupNodes}
          </nav>

          {/* Section content. The reading-width column is anchored to the left,
              next to its section nav (the conventional settings layout — macOS
              System Settings, VS Code, Discord). Centering it instead left the
              card floating with dead space on BOTH sides on wide windows; a
              single readable column simply can't fill an ultrawide pane, and a
              full-width stretch would blow out label/value rows. */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-6 pb-20">
            <div className="max-w-2xl space-y-4">
              <Panel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
