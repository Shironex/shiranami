import { useTranslation } from 'react-i18next';
import type {
  ILibraryBannerPreviewProps,
  ILibraryBannerPreviewView,
} from './LibraryBannerPreview.types';

/**
 * LibraryBannerPreview is a pure presentational mock; the hook resolves the
 * localized caption and forwards the toggle so the shell stays a thin render.
 */
export function useLibraryBannerPreview({
  enabled,
}: ILibraryBannerPreviewProps): ILibraryBannerPreviewView {
  const { t } = useTranslation('settings');

  return {
    title: t('app.effectPreview.libraryBanner'),
    enabled,
  };
}
