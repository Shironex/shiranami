import { useTranslation } from 'react-i18next';
import { BUY_ME_A_COFFEE_URL, GITHUB_SPONSORS_URL } from '@/lib/constants';
import { useSupportBannerStore } from '@/stores/useSupportBannerStore';
import type { ISupportSectionView } from './SupportSection.types';

export function useSupportSection(): ISupportSectionView {
  const { t } = useTranslation('settings');
  const setSeen = useSupportBannerStore(s => s.setSeen);

  return {
    t,
    buyMeACoffeeUrl: BUY_ME_A_COFFEE_URL,
    githubSponsorsUrl: GITHUB_SPONSORS_URL,
    onMarkSeen: setSeen,
  };
}
