import { Sparkles, Play, Shuffle, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { List } from 'react-window';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { TrackRow } from '@/components/shared/TrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { STAGGER_CONTAINER } from '@/lib/motion';
import { useMixesView } from './MixesView.hooks';
import { MixesViewSkeleton } from './MixesViewSkeleton';
import { MixGridRow } from './MixGridRow';
import { SmartMixRow } from './SmartMixRow';
import { ArtCollage } from '../ArtCollage';

export default function MixesView() {
  const view = useMixesView();
  const prefersReducedMotion = useReducedMotion();

  if (view.showSkeleton) {
    return <MixesViewSkeleton />;
  }

  if (view.isEmpty) {
    return (
      <ViewEmptyState title={view.t('title')} subtitle={view.t('emptyLibrary')} icon={Sparkles} />
    );
  }

  // ── Mix detail view ──
  if (view.selectedDef) {
    const Icon = view.selectedDef.icon;

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 pt-2 pb-4 shrink-0 space-y-3">
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={view.onBack}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={view.t('back')}
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>

            <div className="flex-1" />

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={view.onShuffle}
              disabled={view.mixIsEmpty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
            >
              <Shuffle className="w-3.5 h-3.5" />
              {view.t('shuffle')}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={view.onPlayAll}
              disabled={view.mixIsEmpty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-40"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {view.t('playAll')}
            </motion.button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-accent/50 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base font-semibold text-foreground">
                {view.t(view.selectedDef.titleKey)}
              </h2>
              <p className="text-xs text-muted-foreground/50 mt-0.5">
                {view.t('trackCount', { count: view.mixTracks.length })}
              </p>
            </div>
          </div>
        </div>

        {view.mixIsEmpty ? (
          <ViewEmptyState
            compact
            title={view.t('mixEmptyTitle')}
            subtitle={view.t(view.selectedDef.emptyKey)}
            icon={Icon}
          />
        ) : (
          <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
            <div className="h-full px-2 py-1.5">
              <List
                rowCount={view.mixTracks.length}
                rowHeight={52}
                overscanCount={10}
                className="scrollbar-thin"
                style={{ height: '100%' }}
                rowComponent={TrackRow}
                rowProps={view.rowProps}
              />
            </div>
          </div>
        )}

        {view.hasSelection && <BulkActionBar trackList={view.mixTracks} />}
      </div>
    );
  }

  // ── Mix grid (overview) ──
  const smartMixRows = view.smartMixCards.map(card => (
    <SmartMixRow
      key={card.id}
      card={card}
      countLabel={view.t('trackCount', { count: card.count })}
    />
  ));

  const mixGridRows = view.mixGridCards.map(card => (
    <MixGridRow
      key={card.id}
      card={card}
      countLabel={view.t('trackCount', { count: card.count })}
    />
  ));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={view.t('pageTitle')} />

      <div className="flex-1 overflow-y-auto px-6 pt-3 pb-6 scrollbar-thin">
        {view.smartMixesFailed && (
          <div className="mb-5">
            <h3 className="px-1 mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/50">
              {view.t('smart.sectionTitle')}
            </h3>
            <div className="rounded-2xl glass-panel border border-border/30 px-4 py-5 text-center">
              <p className="text-sm text-muted-foreground/60">{view.t('smart.failed')}</p>
            </div>
          </div>
        )}

        {smartMixRows.length > 0 && (
          <div className="mb-5">
            <h3 className="px-1 mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/50">
              {view.t('smart.sectionTitle')}
            </h3>
            <div className="rounded-2xl glass-panel border border-border/30 p-2 space-y-1.5">
              {smartMixRows}
            </div>
          </div>
        )}

        <div className="rounded-2xl glass-panel border border-border/30 p-2">
          {prefersReducedMotion ? (
            <div className="space-y-1.5">{mixGridRows}</div>
          ) : (
            <motion.div
              className="space-y-1.5"
              variants={STAGGER_CONTAINER}
              initial="hidden"
              animate="visible"
            >
              {mixGridRows}
            </motion.div>
          )}
        </div>

        {/* Subtle divider and track art collage */}
        <div className="mt-6 pt-5 border-t border-border/10">
          <ArtCollage library={view.library} />
        </div>
      </div>
    </div>
  );
}
