import { useTranslation } from 'react-i18next';
import { DISCORD_ACTIVITY_TYPES, DISCORD_TEMPLATE_VARIABLES } from '@shiranami/shared';
import type { IDiscordTemplateEditorView } from './DiscordTemplateEditor.types';

export function useDiscordTemplateEditor(): IDiscordTemplateEditorView {
  const { t } = useTranslation('settings');

  const activityOptions = DISCORD_ACTIVITY_TYPES.map(type => ({
    value: type,
    label: t(`dsc.activityLabel.${type}`),
  }));

  const variableHints = DISCORD_TEMPLATE_VARIABLES.map(v => ({
    key: v.key,
    description: t(v.descriptionKey),
  }));

  return { t, activityOptions, variableHints };
}
