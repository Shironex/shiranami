import { useTranslation } from 'react-i18next';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { AudioLines } from 'lucide-react';
import { useUIStore } from '@/stores/useUIStore';
import { VisualizerStyleGrid } from '@/components/settings/VisualizerStyleGrid';
import { VisualizerStylePreview } from '@/components/settings/VisualizerStylePreview';

export function VisualizerSection() {
  const { t } = useTranslation('settings');
  const visualizerStyle = useUIStore(s => s.visualizerStyle);
  const setVisualizerStyle = useUIStore(s => s.setVisualizerStyle);
  const showVisualizer = useUIStore(s => s.showVisualizer);
  const toggleVisualizer = useUIStore(s => s.toggleVisualizer);

  return (
    <SettingsCard icon={AudioLines} title={t('vis.title')} subtitle={t('vis.subtitle')}>
      <div className="space-y-4">
        <SettingsToggleRow
          label={t('vis.show')}
          description={t('vis.showDesc')}
          checked={showVisualizer}
          onCheckedChange={() => toggleVisualizer()}
        />

        {showVisualizer && (
          <>
            <VisualizerStylePreview />

            <div className="px-3">
              <p className="text-xs text-muted-foreground mb-3">{t('vis.style')}</p>
              <VisualizerStyleGrid value={visualizerStyle} onSelect={setVisualizerStyle} />
            </div>
          </>
        )}
      </div>
    </SettingsCard>
  );
}
