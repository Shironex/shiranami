import type { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ArrowRight, Check, X } from 'lucide-react';
import type { EnrichFieldDiff, EnrichLastRunEntry } from '@/stores/useMetadataEnrichStore';
import { EnrichConfidenceBadge } from '@/components/settings/EnrichConfidenceBadge';
import { useEnrichLastRunPanel } from './EnrichLastRunPanel.hooks';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

function diffValueText(value: string | number | null, noneLabel: string): string {
  if (value === null || value === '') return noneLabel;
  return String(value);
}

interface IFieldDiffRowProps {
  readonly diff: EnrichFieldDiff;
  readonly tDialog: TranslateFn;
}

function FieldDiffRow({ diff, tDialog }: IFieldDiffRowProps) {
  const noneLabel = tDialog('none');
  if (diff.field === 'albumArt') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="w-20 shrink-0 text-muted-foreground/70 font-medium">
          {tDialog('field.albumArt')}
        </span>
        {diff.oldValue ? (
          <img
            src={String(diff.oldValue)}
            alt=""
            className="w-7 h-7 rounded-md object-cover opacity-50"
          />
        ) : (
          <span className="text-muted-foreground/50">{noneLabel}</span>
        )}
        <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0" aria-hidden="true" />
        <img src={String(diff.newValue)} alt="" className="w-7 h-7 rounded-md object-cover" />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground/70 font-medium pt-0.5">
        {tDialog(`field.${diff.field}`)}
      </span>
      <span className="text-muted-foreground line-through truncate">
        {diffValueText(diff.oldValue, noneLabel)}
      </span>
      <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" aria-hidden="true" />
      <span className="text-foreground truncate">{diffValueText(diff.newValue, noneLabel)}</span>
    </div>
  );
}

interface IRunEntryItemProps {
  readonly entry: EnrichLastRunEntry;
  readonly t: TranslateFn;
  readonly tDialog: TranslateFn;
}

function RunEntryItem({ entry, t, tDialog }: IRunEntryItemProps) {
  const hasChanges = entry.success && entry.diffs.length > 0;
  const showSource = entry.success && entry.source !== 'none';
  const showNoChanges = entry.success && entry.diffs.length === 0;
  const diffRows = entry.diffs.map(diff => (
    <FieldDiffRow key={diff.field} diff={diff} tDialog={tDialog} />
  ));

  return (
    <li className="px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2 min-w-0">
        {hasChanges ? (
          <Check className="w-3.5 h-3.5 text-green-500 shrink-0" aria-hidden="true" />
        ) : entry.success ? (
          <Check className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        ) : (
          <X className="w-3.5 h-3.5 text-destructive shrink-0" aria-hidden="true" />
        )}
        <span className="text-sm text-foreground truncate">{entry.trackName}</span>
        {showSource && (
          <span className="text-xs text-muted-foreground shrink-0">
            {t('lib.enrichLastRunSource', { source: entry.source })}
          </span>
        )}
        <EnrichConfidenceBadge confidence={entry.confidence} />
      </div>
      {hasChanges && <div className="space-y-1 pl-5">{diffRows}</div>}
      {showNoChanges && (
        <p className="pl-5 text-xs text-muted-foreground">{t('lib.enrichLastRunNoChanges')}</p>
      )}
      {!entry.success && (
        <p className="pl-5 text-xs text-muted-foreground">
          {entry.error === 'No metadata found'
            ? t('lib.enrichLastRunNoMatch')
            : t('lib.enrichLastRunFailed', { error: entry.error ?? '' })}
        </p>
      )}
    </li>
  );
}

/**
 * In-memory post-run report for the bulk enrichment feature. A collapsible
 * summary of the last run's per-track results — what changed, what matched, and
 * what failed. Purely a view over the snapshot the store collected when the run
 * finished (the hook owns subscription + open/close state).
 */
export default function EnrichLastRunPanel() {
  const { t, tDialog, visible, open, onToggle, entries, changedCount } = useEnrichLastRunPanel();

  if (!visible) return null;

  const entryItems = entries.map(entry => (
    <RunEntryItem key={entry.id} entry={entry} t={t} tDialog={tDialog} />
  ));

  return (
    <div className="rounded-xl border border-border/20 bg-background/30">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-accent/30 rounded-xl transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        )}
        <span>{t('lib.enrichLastRunTitle')}</span>
        <span className="text-xs text-muted-foreground">
          {t('lib.enrichLastRunSummary', { changed: changedCount, total: entries.length })}
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-border/20 border-t border-border/20">{entryItems}</ul>
      )}
    </div>
  );
}
