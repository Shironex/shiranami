import { Trans } from 'react-i18next';
import {
  Languages,
  FolderOpen,
  ArrowDownToLine,
  Music2,
  Palette,
  Waves,
  ShieldCheck,
} from 'lucide-react';
import { OnboardingStepLayout } from '../../OnboardingStepLayout';
import { SummaryRow } from '../../SummaryRow';
import { useSummaryStep } from './SummaryStep.hooks';

export default function SummaryStep() {
  const {
    t,
    stepContext,
    showTools,
    languageValue,
    foldersValue,
    hasFolders,
    toolsValue,
    playbackValue,
    themeValue,
    visualizerValue,
    privacyValue,
    telemetryEnabled,
  } = useSummaryStep();

  return (
    <OnboardingStepLayout
      kanji={stepContext.kanji}
      headingId={stepContext.headingId}
      headingRef={stepContext.headingRef}
      stepMarker={t('summary.eyebrow')}
      headline={
        <Trans
          t={t}
          i18nKey="summary.headline"
          components={{ 1: <em className="not-italic text-primary" /> }}
        />
      }
      description={t('summary.description')}
    >
      <div className="space-y-3">
        <p className="text-xs font-medium text-foreground">{t('summary.intro')}</p>
        <div role="list" aria-label={t('summary.listAria')} className="flex flex-col gap-2">
          <SummaryRow
            icon={<Languages />}
            label={t('summary.row.language')}
            value={languageValue}
          />
          <SummaryRow
            icon={<FolderOpen />}
            label={t('summary.row.folders')}
            value={foldersValue}
            highlight={hasFolders}
          />
          {showTools && (
            <SummaryRow
              icon={<ArrowDownToLine />}
              label={t('summary.row.tools')}
              value={toolsValue}
            />
          )}
          <SummaryRow icon={<Music2 />} label={t('summary.row.playback')} value={playbackValue} />
          <SummaryRow icon={<Palette />} label={t('summary.row.theme')} value={themeValue} />
          <SummaryRow
            icon={<Waves />}
            label={t('summary.row.visualizer')}
            value={visualizerValue}
          />
          <SummaryRow
            icon={<ShieldCheck />}
            label={t('summary.row.privacy')}
            value={privacyValue}
            highlight={telemetryEnabled}
          />
        </div>
      </div>
    </OnboardingStepLayout>
  );
}
