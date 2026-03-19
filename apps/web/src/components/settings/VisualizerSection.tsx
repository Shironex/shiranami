import { SettingsCard } from '@/components/settings/SettingsCard';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { AudioLines } from 'lucide-react';
import { useAppStore, type VisualizerStyle } from '@/stores/useAppStore';

const VISUALIZER_STYLE_OPTIONS = [
  {
    value: 'bars' as VisualizerStyle,
    label: 'Bars',
    desc: 'Soft frequency bars',
  },
  {
    value: 'waveform' as VisualizerStyle,
    label: 'Waveform',
    desc: 'Flowing audio line',
  },
] as const;

export function VisualizerSection() {
  const visualizerStyle = useAppStore((s) => s.visualizerStyle);
  const setVisualizerStyle = useAppStore((s) => s.setVisualizerStyle);
  const showVisualizer = useAppStore((s) => s.showVisualizer);
  const toggleVisualizer = useAppStore((s) => s.toggleVisualizer);

  return (
    <SettingsCard
      icon={AudioLines}
      title="Visualizer"
      subtitle="Audio visualization above the player bar"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-accent/30 transition-colors">
          <div>
            <p className="text-sm font-medium text-foreground">
              Show visualizer
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Display audio-reactive animation above the player
            </p>
          </div>
          <Switch
            checked={showVisualizer}
            onChange={() => toggleVisualizer()}
          />
        </div>

        {showVisualizer && (
          <div className="px-3">
            <p className="text-xs text-muted-foreground mb-3">Style</p>
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
                      {opt.label}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {opt.desc}
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
