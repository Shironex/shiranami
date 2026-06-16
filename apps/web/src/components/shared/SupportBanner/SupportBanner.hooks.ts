import { useTranslation } from 'react-i18next';
import { useSupportBannerStore } from '@/stores/useSupportBannerStore';
import type { ISupportBannerView } from './SupportBanner.types';

export function useSupportBanner(): ISupportBannerView {
  const { t } = useTranslation('settings');
  const seen = useSupportBannerStore(s => s.seen);
  const setSeen = useSupportBannerStore(s => s.setSeen);

  return { t, seen, onSeen: setSeen };
}
