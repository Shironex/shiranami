import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, PanelLeft } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  SettingsCard,
  SettingsRow,
  SettingsRowLabel,
  SettingsSelectRow,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
import { SidebarPreview } from '@/components/settings/SidebarPreview';
import {
  ALWAYS_VISIBLE_SIDEBAR_ITEMS,
  DEFAULT_SIDEBAR_ORDER,
  SIDEBAR_ITEM_BY_ID,
  type SidebarNavItem,
} from '@/lib/sidebar-items';
import { useUIStore, type LandingView } from '@/stores/useUIStore';
import type { AppView } from '@/stores/useViewStore';

interface SortableSidebarRowProps {
  id: AppView;
  Icon: LucideIcon;
  label: string;
  alwaysOn: boolean;
  visible: boolean;
  dragHandleLabel: string;
  alwaysOnLabel: string;
  onToggle: () => void;
  onHover: (hovering: boolean) => void;
}

function SortableSidebarRow({
  id,
  Icon,
  label,
  alwaysOn,
  visible,
  dragHandleLabel,
  alwaysOnLabel,
  onToggle,
  onHover,
}: SortableSidebarRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const labelId = `sidebar-item-${id}`;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      onMouseEnter={() => visible && onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border border-border/30 bg-background/30 px-2.5 py-2 transition-colors duration-150 hover:border-border/50',
        isDragging && 'relative border-border/60 bg-surface/70 shadow-lg ring-1 ring-primary/30'
      )}
    >
      <button
        type="button"
        aria-label={dragHandleLabel}
        title={dragHandleLabel}
        className={cn(
          'flex shrink-0 cursor-grab touch-none items-center justify-center rounded-md p-0.5 text-muted-foreground/40 transition-colors',
          'hover:bg-foreground/5 hover:text-foreground active:cursor-grabbing',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card'
        )}
        {...attributes}
        {...listeners}
        onFocus={() => visible && onHover(true)}
        onBlur={() => onHover(false)}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          visible ? 'text-muted-foreground' : 'text-muted-foreground/35'
        )}
      />
      <span
        id={labelId}
        className={cn(
          'min-w-0 flex-1 truncate text-sm font-medium',
          visible ? 'text-foreground' : 'text-muted-foreground/50'
        )}
      >
        {label}
        {alwaysOn && (
          <span className="ml-2 text-[10px] font-normal text-muted-foreground/60">
            {alwaysOnLabel}
          </span>
        )}
      </span>
      <Switch
        checked={visible}
        disabled={alwaysOn}
        onCheckedChange={onToggle}
        aria-labelledby={labelId}
      />
    </div>
  );
}

export function SidebarSection() {
  const { t } = useTranslation('settings');
  const { t: ts } = useTranslation('sidebar');
  const sidebarHiddenItems = useUIStore(s => s.sidebarHiddenItems);
  const sidebarOrder = useUIStore(s => s.sidebarOrder);
  const toggleSidebarItem = useUIStore(s => s.toggleSidebarItem);
  const reorderSidebarItem = useUIStore(s => s.reorderSidebarItem);
  const resetSidebar = useUIStore(s => s.resetSidebar);
  const sidebarPlaylistsVisible = useUIStore(s => s.sidebarPlaylistsVisible);
  const setSidebarPlaylistsVisible = useUIStore(s => s.setSidebarPlaylistsVisible);
  const landingView = useUIStore(s => s.landingView);
  const setLandingView = useUIStore(s => s.setLandingView);
  const [hoveredId, setHoveredId] = useState<AppView | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Render rows in the user-chosen order; fall back to the default for any id
  // not yet present (fresh install). Always a complete, deduped list.
  const orderedItems = useMemo<SidebarNavItem[]>(() => {
    const order = sidebarOrder?.length ? sidebarOrder : DEFAULT_SIDEBAR_ORDER;
    return order
      .map(id => SIDEBAR_ITEM_BY_ID.get(id))
      .filter((item): item is SidebarNavItem => item != null);
  }, [sidebarOrder]);
  const orderedIds = useMemo(() => orderedItems.map(item => item.id), [orderedItems]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderSidebarItem(active.id as AppView, over.id as AppView);
    }
  };

  return (
    <SettingsCard icon={PanelLeft} title={t('app.sidebarTitle')} subtitle={t('app.sidebarDesc')}>
      <SidebarPreview highlightedId={hoveredId} />

      <div className="border-t border-border/30 pt-1">
        <SettingsSelectRow
          label={t('app.landingViewLabel')}
          description={t('app.landingViewDesc')}
          value={landingView}
          onValueChange={value => setLandingView(value as LandingView)}
          options={[
            { value: 'overview', label: ts('overview') },
            { value: 'library', label: ts('library') },
          ]}
        />

        <div className="mt-3.5 space-y-2.5 border-t border-border/30 pt-3.5">
          <p className="text-xs leading-snug text-muted-foreground">
            {t('app.sidebarReorderHint')}
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {orderedItems.map(item => {
                  const alwaysOn = ALWAYS_VISIBLE_SIDEBAR_ITEMS.has(item.id);
                  const visible = alwaysOn || !sidebarHiddenItems.includes(item.id);
                  const label = ts(item.key);
                  return (
                    <SortableSidebarRow
                      key={item.id}
                      id={item.id}
                      Icon={item.Icon}
                      label={label}
                      alwaysOn={alwaysOn}
                      visible={visible}
                      dragHandleLabel={t('app.sidebarDragHandle', { label })}
                      alwaysOnLabel={t('app.sidebarAlwaysOn')}
                      onToggle={() => toggleSidebarItem(item.id)}
                      onHover={hovering =>
                        setHoveredId(prev => (hovering ? item.id : prev === item.id ? null : prev))
                      }
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <SettingsToggleRow
          label={t('app.sidebarPlaylists')}
          description={t('app.sidebarPlaylistsDesc')}
          checked={sidebarPlaylistsVisible}
          onCheckedChange={setSidebarPlaylistsVisible}
          divider
        />

        <SettingsRow divider>
          <SettingsRowLabel
            label={t('app.sidebarResetTitle')}
            description={t('app.sidebarResetDesc')}
          />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetSidebar}>
            {t('app.sidebarReset')}
          </Button>
        </SettingsRow>
      </div>
    </SettingsCard>
  );
}
