import { useTranslation } from 'react-i18next';
import { IS_MAC, IS_ELECTRON } from '@/lib/platform';
import {
  useSystemPrefsQuery,
  useUpdateSystemPrefMutation,
  type SystemPrefKey,
} from '@/hooks/queries/useSystemPrefs';
import type { ISystemSectionView, ISystemToggle } from './SystemSection.types';

const TOGGLE_KEYS: SystemPrefKey[] = ['launchAtStartup', 'minimizeToTray', 'closeToTray'];

export function useSystemSection(): ISystemSectionView {
  const { t } = useTranslation('settings');
  const { data: prefs } = useSystemPrefsQuery();
  const updatePref = useUpdateSystemPrefMutation();

  const toggles: ISystemToggle[] = TOGGLE_KEYS.map((key, index) => ({
    key,
    label: t(`sys.${key}`),
    description: t(`sys.${key}Desc`),
    checked: prefs?.[key] ?? false,
    disabled: !IS_ELECTRON || !prefs,
    divider: index > 0,
    onCheckedChange: (value: boolean) => updatePref.mutate({ key, value }),
  }));

  return {
    t,
    toggles,
    showMacTrayNote: IS_MAC,
  };
}
