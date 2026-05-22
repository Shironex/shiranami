import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { SETTINGS_SIDEBAR_ITEMS } from '@/components/settings/SettingsSidebarConfig';

export function SidebarPreview() {
  const { t } = useTranslation('settings');
  const { t: ts } = useTranslation('sidebar');
  const sidebarHiddenItems = useUIStore(s => s.sidebarHiddenItems);
  const sidebarPlaylistsVisible = useUIStore(s => s.sidebarPlaylistsVisible);
  const visibleItems = SETTINGS_SIDEBAR_ITEMS.filter(item => !sidebarHiddenItems.includes(item.id));

  return (
    <SettingsPreview title={t('app.sidebarPreview')}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={t('app.sidebarPreview')}
      >
        <div className="mx-auto flex h-[230px] max-w-[360px] overflow-hidden rounded-xl border border-border/30 bg-surface/60 shadow-sm">
          <aside className="flex w-[132px] shrink-0 flex-col border-r border-border/30 bg-background/35 p-2">
            <div className="mb-2 flex items-center gap-2 rounded-lg px-1 py-1.5">
              <div className="size-6 rounded-md bg-primary/20" />
              <div className="h-2.5 w-16 rounded-full bg-foreground/18" />
            </div>

            <div className="space-y-1">
              {visibleItems.slice(0, 8).map((item, index) => {
                const Icon = item.Icon;
                const active = index === 0;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px]',
                      active
                        ? 'bg-primary/15 text-foreground ring-1 ring-primary/25'
                        : 'text-muted-foreground/80'
                    )}
                  >
                    <Icon className="size-3 shrink-0" />
                    <span className="min-w-0 truncate">{ts(item.key)}</span>
                  </div>
                );
              })}
            </div>

            {sidebarPlaylistsVisible && (
              <div className="mt-auto border-t border-border/30 pt-2">
                <div className="mb-1.5 h-1.5 w-16 rounded-full bg-muted-foreground/25" />
                <div className="space-y-1">
                  <div className="h-5 rounded-md bg-muted/35" />
                  <div className="h-5 rounded-md bg-muted/25" />
                </div>
              </div>
            )}

            <div className="mt-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground/70">
              <Settings className="size-3 shrink-0" />
              <span className="min-w-0 truncate">{ts('settings')}</span>
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col gap-3 p-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="h-2.5 w-20 rounded-full bg-foreground/20" />
                <div className="h-1.5 w-28 rounded-full bg-muted-foreground/20" />
              </div>
              <div className="size-7 rounded-lg bg-primary/15" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-16 rounded-lg border border-border/25 bg-muted/20" />
              <div className="h-16 rounded-lg border border-border/25 bg-muted/15" />
            </div>
            <div className="mt-auto space-y-1.5">
              <div className="h-2 rounded-full bg-muted/35" />
              <div className="h-2 w-3/4 rounded-full bg-muted/25" />
              <div className="h-2 w-1/2 rounded-full bg-muted/20" />
            </div>
          </main>
        </div>
      </div>
    </SettingsPreview>
  );
}
