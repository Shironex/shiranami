import { useTranslation } from 'react-i18next';
import type {
  INowPlayingViewPreviewProps,
  INowPlayingViewPreviewView,
} from './NowPlayingViewPreview.types';

/**
 * NowPlayingViewPreview is a pure presentational mock; the hook resolves the
 * localized caption and forwards the toggle so the shell stays a thin render.
 */
export function useNowPlayingViewPreview({
  enabled,
}: INowPlayingViewPreviewProps): INowPlayingViewPreviewView {
  const { t } = useTranslation('settings');

  return {
    title: t('app.effectPreview.nowPlayingView'),
    enabled,
  };
}
