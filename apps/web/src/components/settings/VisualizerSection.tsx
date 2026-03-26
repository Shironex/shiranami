import { useTranslation } from 'react-i18next';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { AudioLines } from 'lucide-react';
import { useAppStore, type VisualizerStyle } from '@/stores/useAppStore';

const VISUALIZER_STYLE_OPTIONS = [
  {
    value: 'bars' as VisualizerStyle,
    labelKey: 'vis.bars',
    descKey: 'vis.barsDesc',
  },
  {
    value: 'waveform' as VisualizerStyle,
    labelKey: 'vis.waveform',
    descKey: 'vis.waveformDesc',
  },
] as const;

export function VisualizerSection() {
  const { t } = useTranslation('settings');
  const visualizerStyle = useAppStore((s) => s.visualizerStyle);
  const setVisualizerStyle = useAppStore((s) => s.setVisualizerStyle);
  const showVisualizer = useAppStore((s) => s.showVisualizer);
  const toggleVisualizer = useAppStore((s) => s.toggleVisualizer);

  return (
    <SettingsCard
      icon={AudioLines}
      title={t('vis.title')}
      subtitle={t('vis.subtitle')}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
          <div>
            <p className="text-sm font-medium text-foreground">
              {t('vis.show')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('vis.showDesc')}
            </p>
          </div>
          <Switch
            checked={showVisualizer}
            onChange={() => toggleVisualizer()}
          />
        </div>

        {showVisualizer && (
          <div className="px-3">
            <p className="text-xs text-muted-foreground mb-3">{t('vis.style')}</p>
            <div className="flex gap-3">
              {VISUALIZER_STYLE_OPTIONS.map((opt) => {
                const selected = visualizerStyle === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setVisualizerStyle(opt.value)}
                    className={cn(
                      'flex-1 px-4 py-3 rounded-xl border text-left transition-all',
                      selected
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border/30 hover:border-border/50 hover:bg-accent/30',
                    )}
                  >
                    <p
                      className={cn(
                        'text-sm font-medium',
                        selected ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {t(opt.labelKey)}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {t(opt.descKey)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
