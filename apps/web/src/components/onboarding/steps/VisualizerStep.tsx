import { useTranslation, Trans } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { VisualizerStyleGrid } from '@/components/settings/VisualizerStyleGrid';
import { VisualizerStylePreview } from '@/components/settings/VisualizerStylePreview';
import { OnboardingStepLayout } from '../OnboardingStepLayout';
import { useOnboardingStepContext } from '../stepContext';

export function VisualizerStep() {
  const { t } = useTranslation('onboarding');
  const { kanji, headingId, headingRef } = useOnboardingStepContext();
  const visualizerStyle = useUIStore(s => s.visualizerStyle);
  const setVisualizerStyle = useUIStore(s => s.setVisualizerStyle);

  return (
    <OnboardingStepLayout
      kanji={kanji}
      headingId={headingId}
      headingRef={headingRef}
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
          <div className="max-h-40 overflow-y-auto scrollbar-thin pr-0.5">
            <VisualizerStyleGrid
              value={visualizerStyle}
              onSelect={setVisualizerStyle}
              columns={3}
              compact
            />
          </div>
        </div>
      </div>
    </OnboardingStepLayout>
  );
}
