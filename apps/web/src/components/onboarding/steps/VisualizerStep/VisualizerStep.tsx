import { Trans } from 'react-i18next';
import { VisualizerStyleGrid } from '@/components/settings/VisualizerStyleGrid';
import { VisualizerStylePreview } from '@/components/settings/VisualizerStylePreview';
import { OnboardingStepLayout } from '../../OnboardingStepLayout';
import { useVisualizerStep } from './VisualizerStep.hooks';

export default function VisualizerStep() {
  const { t, stepContext, visualizerStyle, onSelectVisualizerStyle } = useVisualizerStep();

  return (
    <OnboardingStepLayout
      kanji={stepContext.kanji}
      headingId={stepContext.headingId}
      headingRef={stepContext.headingRef}
      stepMarker={t('visualizer.eyebrow')}
      headline={
        <Trans
          t={t}
          i18nKey="visualizer.headline"
          components={{ 1: <em className="not-italic text-primary" /> }}
        />
      }
      description={t('visualizer.description')}
    >
      <div className="space-y-4">
        <VisualizerStylePreview />
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-foreground">{t('visualizer.title')}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/70">
              {t('visualizer.hint')}
            </p>
          </div>
          <VisualizerStyleGrid
            value={visualizerStyle}
            onSelect={onSelectVisualizerStyle}
            columns={3}
            compact
          />
        </div>
      </div>
    </OnboardingStepLayout>
  );
}
