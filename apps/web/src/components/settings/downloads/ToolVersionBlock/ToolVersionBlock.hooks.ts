import { useTranslation } from 'react-i18next';
import type { IToolVersionBlockProps, IToolVersionBlockView } from './ToolVersionBlock.types';

/**
 * Binds the `settings` translator and forwards the version props so the shell
 * renders pre-resolved labels and stays free of `useTranslation`.
 */
export function useToolVersionBlock({
  installedVersion,
  latestVersion,
}: IToolVersionBlockProps): IToolVersionBlockView {
  const { t } = useTranslation('settings');

  return {
    installedVersion,
    latestVersion,
    installedVersionLabel: t('dl.installedVersion'),
    latestReleaseLabel: t('dl.latestRelease'),
  };
}
