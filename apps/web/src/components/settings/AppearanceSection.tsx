import { Monitor } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import {
  useAppStore,
  UI_SCALE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_STEP,
  UI_SCALE_DEFAULT,
  UI_SCALE_PRESETS,
} from '@/stores/useAppStore';
import { cn } from '@/lib/utils';

export function AppearanceSection() {
  const uiScale = useAppStore((s) => s.uiScale);
  const setUiScale = useAppStore((s) => s.setUiScale);
  const resetUiScale = useAppStore((s) => s.resetUiScale);

  return (
    <SettingsCard
      icon={Monitor}
      title="Appearance"
      subtitle="Customize the look and feel of the app"
    >
      <div className="space-y-4">
        <div className="px-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-foreground">Interface scale</p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {uiScale}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Adjust the size of text and UI elements
          </p>

          <Slider
            min={UI_SCALE_MIN}
            max={UI_SCALE_MAX}
            step={UI_SCALE_STEP}
            value={[uiScale]}
            onValueChange={([v]) => setUiScale(v)}
          />

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-1.5">
              {UI_SCALE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setUiScale(preset)}
                  className={cn(
                    'px-2 py-1 rounded-md text-xs font-medium transition-colors',
                    uiScale === preset
                      ? 'bg-primary/15 text-primary border border-primary/40'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent',
                  )}
                >
                  {preset}%
                </button>
              ))}
            </div>

            {uiScale !== UI_SCALE_DEFAULT && (
              <button
                onClick={resetUiScale}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
