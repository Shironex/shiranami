import { useTranslation } from 'react-i18next';
import type { IDiscordPreviewView } from './DiscordPreview.types';

export function useDiscordPreview(): IDiscordPreviewView {
  const { t } = useTranslation('settings');
  return { t };
}
