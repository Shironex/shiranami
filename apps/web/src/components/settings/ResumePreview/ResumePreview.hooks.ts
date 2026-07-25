import { useTranslation } from 'react-i18next';
import type { IResumePreviewProps, IResumePreviewView } from './ResumePreview.types';

/** Saved position the mock shows once resume is on. */
const RESUMED_POSITION_LABEL = '1:42';
const RESUMED_PROGRESS_WIDTH = '44%';

/**
 * Resolves the resume preview's localized copy and the two values the toggle
 * drives — the saved position and the progress fill — so the shell stays a thin
 * render.
 */
export function useResumePreview({ enabled }: IResumePreviewProps): IResumePreviewView {
  const { t } = useTranslation('settings');

  return {
    title: t('play.resumePreview'),
    trackLabel: t('play.previewTrack'),
    positionLabel: enabled ? RESUMED_POSITION_LABEL : '0:00',
    progressWidth: enabled ? RESUMED_PROGRESS_WIDTH : '0%',
    caption: enabled ? t('play.resumePreviewOn') : t('play.resumePreviewOff'),
  };
}
