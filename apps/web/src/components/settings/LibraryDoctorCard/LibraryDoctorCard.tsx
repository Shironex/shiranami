import { CheckCircle2, Loader2, Stethoscope } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DoctorSeverity } from '@shiranami/contracts';
import { useLibraryDoctorCard } from './LibraryDoctorCard.hooks';

const SEVERITY_DOT: Record<DoctorSeverity, string> = {
  error: 'bg-destructive',
  warning: 'bg-amber-400',
  info: 'bg-muted-foreground/60',
};

/**
 * Settings > Library: the Library Doctor (F8). One button decodes every
 * library file and reports what only a real decoder can see — truncated
 * downloads, damaged frames, duration lies, clipped masters, silence.
 * Findings are informative; the card fixes nothing.
 */
export default function LibraryDoctorCard() {
  const {
    title,
    subtitle,
    idleLabel,
    running,
    progressLabel,
    runLabel,
    cancelLabel,
    onRun,
    onCancel,
    summaryLabel,
    allHealthy,
    findings,
  } = useLibraryDoctorCard();

  const showSummary = summaryLabel != null && !running;
  const showFindings = findings.length > 0 && !running;
  const findingItems = findings.map(finding => (
    <li
      key={finding.key}
      className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-background/50 border border-border/20"
    >
      <span
        aria-hidden
        className={cn('mt-1.5 size-2 shrink-0 rounded-full', SEVERITY_DOT[finding.severity])}
      />
      <div className="min-w-0">
        <p className="text-sm text-foreground truncate">{finding.title}</p>
        <p className="text-xs text-muted-foreground">{finding.label}</p>
        <p className="text-[10px] text-muted-foreground/60 truncate">{finding.filePath}</p>
      </div>
    </li>
  ));

  return (
    <SettingsCard icon={Stethoscope} title={title} subtitle={subtitle}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{progressLabel ?? idleLabel}</p>
          {running ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={onRun} className="[&_svg]:size-3.5">
              <Stethoscope />
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

        {showSummary && (
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20',
              allHealthy && 'text-emerald-300'
            )}
          >
            {allHealthy && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span className="text-sm">{summaryLabel}</span>
          </div>
        )}

        {showFindings && (
          <ul className="space-y-1.5" data-testid="doctor-findings">
            {findingItems}
          </ul>
        )}
      </div>
    </SettingsCard>
  );
}
