import { AudioLines, CheckCircle2, Loader2 } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLibraryAnalysisCard } from './LibraryAnalysisCard.hooks';

/**
 * Settings > Library: the one-pass analysis engine's card. One button decodes
 * every pending track once and persists tempo and musical key (waveform peaks
 * and loudness ride the same decode). The coverage line doubles as the gentle
 * affordance for tempo breathing: an unanalysed library never breathes, and
 * this is the one click that fixes it.
 */
export default function LibraryAnalysisCard() {
  const {
    title,
    subtitle,
    coverageLabel,
    allAnalyzed,
    running,
    progressLabel,
    runLabel,
    cancelLabel,
    onRun,
    onCancel,
  } = useLibraryAnalysisCard();

  return (
    <SettingsCard icon={AudioLines} title={title} subtitle={subtitle}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div
            className={cn(
              'flex items-center gap-2',
              allAnalyzed ? 'text-emerald-300' : 'text-muted-foreground'
            )}
          >
            {allAnalyzed && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <p className="text-xs">{coverageLabel}</p>
          </div>
          {running ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRun}
              disabled={allAnalyzed}
              className="[&_svg]:size-3.5"
            >
              <AudioLines />
              {runLabel}
            </Button>
          )}
        </div>

        {running && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground truncate">{progressLabel}</span>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
