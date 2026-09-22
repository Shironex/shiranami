import {
  GripVertical,
  LayoutDashboard,
  PanelBottom,
  PanelRight,
  PanelTop,
  RotateCcw,
} from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { OverviewSectionId } from '@/lib/overview-sections';
import {
  SettingsCard,
  SettingsToggleRow,
  SettingsSelectRow,
} from '@/components/settings/SettingsCard';
import { CompanionSection } from '@/components/settings/CompanionSection';
import { LayoutPreview } from '@/components/settings/LayoutPreview';
import { TopBarPreview } from '@/components/settings/TopBarPreview';
import { OverviewLayoutPreview } from '@/components/settings/OverviewLayoutPreview';
import { PlayerBarPreview } from '@/components/settings/PlayerBarPreview';
import { useInterfaceSection } from './InterfaceSection.hooks';

interface ISortableOverviewSectionProps {
  id: OverviewSectionId;
  dragHandleLabel: string;
  /** Group label, rendered only for multi-widget sections. */
  groupLabel: string | null;
  children: ReactNode;
}

/** Draggable frame around one Overview section's toggle row(s). */
function SortableOverviewSection({
  id,
  dragHandleLabel,
  groupLabel,
  children,
}: ISortableOverviewSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={cn(
        'flex items-start gap-1.5 rounded-lg border border-border/30 bg-background/30 px-2.5 py-1 transition-colors duration-150 hover:border-border/50',
        isDragging && 'relative border-border/60 bg-surface/70 shadow-lg ring-1 ring-primary/30'
      )}
    >
      <button
        type="button"
        aria-label={dragHandleLabel}
        title={dragHandleLabel}
        className={cn(
          'mt-3.5 flex shrink-0 cursor-grab touch-none items-center justify-center rounded-md p-0.5 text-muted-foreground/40 transition-colors',
          'hover:bg-foreground/5 hover:text-foreground active:cursor-grabbing',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card'
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        {groupLabel && (
          <p className="pt-3 text-sm font-medium leading-snug text-foreground">{groupLabel}</p>
        )}
        {children}
      </div>
    </div>
  );
}

export default function InterfaceSection() {
  const {
    t,
    isModified,
    onResetInterface,
    sidePanelSide,
    sideOptions,
    onSelectSide,
    topBarLanguageSwitcher,
    onToggleTopBarLanguageSwitcher,
    overviewSections,
    overviewOrderIds,
    overviewReorderHint,
    overviewSensors,
    onReorderOverview,
    hoveredOverviewKey,
    onHoverOverview,
    playerToggles,
    hoveredPlayerKey,
    onHoverPlayer,
    onSetVisible,
  } = useInterfaceSection();

  const overviewRows = overviewSections.map(section => {
    const toggleRows = section.toggles.map(row => (
      <div
        key={row.key}
        onMouseEnter={() => onHoverOverview(row.key, true)}
        onMouseLeave={() => onHoverOverview(row.key, false)}
      >
        <SettingsToggleRow
          label={row.label}
          description={row.description}
          checked={row.checked}
          onCheckedChange={v => onSetVisible(row.key, v)}
          divider={row.divider}
        />
      </div>
    ));

    return (
      <SortableOverviewSection
        key={section.id}
        id={section.id}
        dragHandleLabel={section.dragHandleLabel}
        groupLabel={section.toggles.length > 1 ? section.label : null}
      >
        {toggleRows}
      </SortableOverviewSection>
    );
  });

  const playerRows = playerToggles.map(row => (
    <div
      key={row.key}
      onMouseEnter={() => onHoverPlayer(row.key, true)}
      onMouseLeave={() => onHoverPlayer(row.key, false)}
    >
      <SettingsToggleRow
        label={row.label}
        description={row.description}
        checked={row.checked}
        onCheckedChange={v => onSetVisible(row.key, v)}
        divider={row.divider}
      />
    </div>
  ));

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={PanelRight}
        title={t('app.interface.layoutTitle')}
        subtitle={t('app.interface.layoutDesc')}
      >
        <LayoutPreview />
        <SettingsSelectRow
          label={t('app.interface.sidePanelPosition')}
          description={t('app.interface.sidePanelPositionDesc')}
          value={sidePanelSide}
          onValueChange={v => onSelectSide(v as typeof sidePanelSide)}
          options={sideOptions}
        />
      </SettingsCard>

      <SettingsCard
        icon={PanelTop}
        title={t('app.interface.topBarTitle')}
        subtitle={t('app.interface.topBarDesc')}
        headerRight={
          isModified ? (
            <button
              onClick={onResetInterface}
              className="focus-ring rounded-sm flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('app.interface.reset')}
            >
              <RotateCcw className="size-3" />
              {t('app.interface.reset')}
            </button>
          ) : undefined
        }
      >
        <SettingsToggleRow
          label={t('app.interface.elements.topBarLanguageSwitcher')}
          description={t('app.interface.elements.topBarLanguageSwitcherDesc')}
          checked={topBarLanguageSwitcher}
          onCheckedChange={onToggleTopBarLanguageSwitcher}
        />
        <TopBarPreview enabled={topBarLanguageSwitcher} />
      </SettingsCard>

      <CompanionSection />

      <SettingsCard
        icon={LayoutDashboard}
        title={t('app.interface.overviewTitle')}
        subtitle={t('app.interface.overviewDesc')}
      >
        <OverviewLayoutPreview highlightedKey={hoveredOverviewKey} />
        <div className="space-y-2.5">
          <p className="text-xs leading-snug text-muted-foreground">{overviewReorderHint}</p>
          <DndContext
            sensors={overviewSensors}
            collisionDetection={closestCenter}
            onDragEnd={onReorderOverview}
          >
            <SortableContext items={overviewOrderIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">{overviewRows}</div>
            </SortableContext>
          </DndContext>
        </div>
      </SettingsCard>

      <SettingsCard
        icon={PanelBottom}
        title={t('app.interface.playerTitle')}
        subtitle={t('app.interface.playerDesc')}
      >
        <PlayerBarPreview highlightedKey={hoveredPlayerKey} />
        {playerRows}
      </SettingsCard>
    </div>
  );
}
