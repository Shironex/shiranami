import { useTranslation } from 'react-i18next';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { cn } from '@/lib/utils';
import { AudioLines } from 'lucide-react';
import { useUIStore } from '@/stores/useUIStore';
import { VISUALIZER_STYLES } from '@/components/player/visualizerRegistry';
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
              <div className="grid grid-cols-2 gap-3">
                {VISUALIZER_STYLES.map(opt => {
                  const selected = visualizerStyle === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setVisualizerStyle(opt.value)}
                      className={cn(
                        'flex-1 px-4 py-3 rounded-xl border text-left transition-all',
                        selected
                          ? 'border-primary/40 bg-primary/10'
                          : 'border-border/30 hover:border-border/50 hover:bg-accent/30'
                      )}
                    >
                      <p
                        className={cn(
                          'text-sm font-medium',
                          selected ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {t(opt.labelKey)}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{t(opt.descKey)}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </SettingsCard>
  );
}
