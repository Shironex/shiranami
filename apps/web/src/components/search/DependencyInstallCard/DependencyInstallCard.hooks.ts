import { useTranslation } from 'react-i18next';
import type {
  IDependencyInstallCardProps,
  IDependencyInstallCardView,
} from './DependencyInstallCard.types';

export function useDependencyInstallCard({
  ffmpegInstalled,
  installStatus,
  installError,
  isInstallInProgress,
  installProgress,
  installLabel,
}: IDependencyInstallCardProps): IDependencyInstallCardView {
  const { t } = useTranslation('search');

  const showProgress = installStatus === 'downloading' || isInstallInProgress;
  const showSuccess = !showProgress && installStatus === 'done';
  const showInstallButton = !showProgress && !showSuccess;

  return {
    title: t('toolsMissing'),
    description: ffmpegInstalled === false ? t('toolsMissingDescBoth') : t('toolsMissingDescYtdlp'),
    showProgress,
    showSuccess,
    showInstallButton,
    progressCaption: `${installLabel}... ${installProgress}%`,
    installedLabel: t('toolsInstalled'),
    installButtonLabel: t('installMissingTools'),
    showError: installStatus === 'error' && installError !== null,
  };
}
