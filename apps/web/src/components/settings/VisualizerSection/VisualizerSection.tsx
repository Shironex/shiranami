import { AudioLines } from 'lucide-react';
import {
  SettingsCard,
  SettingsToggleRow,
  SettingsSelectRow,
} from '@/components/settings/SettingsCard';
import { VisualizerStyleGrid } from '@/components/settings/VisualizerStyleGrid';
import { VisualizerStylePreview } from '@/components/settings/VisualizerStylePreview';
import { useVisualizerSection } from './VisualizerSection.hooks';

export default function VisualizerSection() {
  const {
    title,
    subtitle,
    showLabel,
    showDescription,
    showVisualizer,
    onToggleVisualizer,
    positionLabel,
    positionDescription,
    visualizerPosition,
    positionDisabled,
    positionOptions,
    onPositionChange,
    styleLabel,
    visualizerStyle,
    onStyleChange,
  } = useVisualizerSection();

  return (
    <SettingsCard icon={AudioLines} title={title} subtitle={subtitle}>
      <div className="space-y-4">
        <SettingsToggleRow
          label={showLabel}
          description={showDescription}
          checked={showVisualizer}
          onCheckedChange={onToggleVisualizer}
        />

        {showVisualizer && (
          <>
            <SettingsSelectRow
              label={positionLabel}
              description={positionDescription}
              value={visualizerPosition}
              onValueChange={onPositionChange}
              disabled={positionDisabled}
              options={positionOptions}
            />

            <VisualizerStylePreview />

            <div className="px-3">
              <p className="text-xs text-muted-foreground mb-3">{styleLabel}</p>
              <VisualizerStyleGrid value={visualizerStyle} onSelect={onStyleChange} />
            </div>
          </>
        )}
      </div>
    </SettingsCard>
  );
}
