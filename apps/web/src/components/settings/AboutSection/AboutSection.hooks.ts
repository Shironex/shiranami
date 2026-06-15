import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { useAppVersion } from '@/hooks/useAppVersion';
import { useAbout } from '@/hooks/useAbout';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import type { IAboutSectionView } from './AboutSection.types';

export function useAboutSection(): IAboutSectionView {
  const { t } = useTranslation('settings');
  const version = useAppVersion();
  const { openLogsFolder } = useAbout();
  const resetOnboarding = useOnboardingStore(s => s.resetOnboarding);

  return {
    t,
    versionLabel: version ?? '…',
    showLogsCard: IS_ELECTRON,
    onOpenLogs: () => openLogsFolder.mutate(),
    onReplayOnboarding: resetOnboarding,
  };
}
