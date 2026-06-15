import { GripVertical, PanelLeft } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  SettingsCard,
  SettingsRow,
  SettingsRowLabel,
  SettingsSelectRow,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
import { SidebarPreview } from '@/components/settings/SidebarPreview';
import type { AppView } from '@/stores/useViewStore';
import { useSidebarSection } from './SidebarSection.hooks';

interface ISortableSidebarRowProps {
  id: AppView;
  Icon: LucideIcon;
  label: string;
  alwaysOn: boolean;
  visible: boolean;
  experimental: boolean;
  dragHandleLabel: string;
  alwaysOnLabel: string;
  experimentalLabel: string;
  onToggle: () => void;
  onHover: (hovering: boolean) => void;
}

function SortableSidebarRow({
  id,
  Icon,
  label,
  alwaysOn,
  visible,
  experimental,
  dragHandleLabel,
  alwaysOnLabel,
  experimentalLabel,
  onToggle,
  onHover,
}: ISortableSidebarRowProps) {
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
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          id={labelId}
          className={cn(
            'min-w-0 truncate text-sm font-medium',
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
        {experimental && (
          <StatusBadge variant="experimental" className={cn(!visible && 'opacity-60')}>
            {experimentalLabel}
          </StatusBadge>
        )}
      </div>
      <Switch
        checked={visible}
        disabled={alwaysOn}
        onCheckedChange={onToggle}
        aria-labelledby={labelId}
      />
    </div>
  );
}

export default function SidebarSection() {
  const {
    t,
    sensors,
    rows,
    orderedIds,
    alwaysOnLabel,
    experimentalLabel,
    landingView,
    landingOptions,
    onSelectLandingView,
    playlistsVisible,
    onSetPlaylistsVisible,
    onToggleItem,
    onHoverItem,
    onDragEnd,
    onReset,
    hoveredId,
  } = useSidebarSection();

  const sortableRows = rows.map(row => (
    <SortableSidebarRow
      key={row.id}
      id={row.id}
      Icon={row.Icon}
      label={row.label}
      alwaysOn={row.alwaysOn}
      visible={row.visible}
      experimental={row.experimental}
      dragHandleLabel={row.dragHandleLabel}
      alwaysOnLabel={alwaysOnLabel}
      experimentalLabel={experimentalLabel}
      onToggle={() => onToggleItem(row.id)}
      onHover={hovering => onHoverItem(row.id, hovering)}
    />
  ));

  return (
    <SettingsCard icon={PanelLeft} title={t('app.sidebarTitle')} subtitle={t('app.sidebarDesc')}>
      <SidebarPreview highlightedId={hoveredId} />

      <div className="border-t border-border/30 pt-1">
        <SettingsSelectRow
          label={t('app.landingViewLabel')}
          description={t('app.landingViewDesc')}
          value={landingView}
          onValueChange={value => onSelectLandingView(value as typeof landingView)}
          options={landingOptions}
        />

        <div className="mt-3.5 space-y-2.5 border-t border-border/30 pt-3.5">
          <p className="text-xs leading-snug text-muted-foreground">
            {t('app.sidebarReorderHint')}
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">{sortableRows}</div>
            </SortableContext>
          </DndContext>
        </div>

        <SettingsToggleRow
          label={t('app.sidebarPlaylists')}
          description={t('app.sidebarPlaylistsDesc')}
          checked={playlistsVisible}
          onCheckedChange={onSetPlaylistsVisible}
          divider
        />

        <SettingsRow divider>
          <SettingsRowLabel
            label={t('app.sidebarResetTitle')}
            description={t('app.sidebarResetDesc')}
          />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onReset}>
            {t('app.sidebarReset')}
          </Button>
        </SettingsRow>
      </div>
    </SettingsCard>
  );
}
