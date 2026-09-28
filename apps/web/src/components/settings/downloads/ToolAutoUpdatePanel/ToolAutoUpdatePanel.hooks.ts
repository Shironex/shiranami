import { useTranslation } from 'react-i18next';
import type { ToolUpdateRecord } from '@shiranami/contracts';
import type {
  IToolAutoUpdatePanelProps,
  IToolAutoUpdatePanelView,
  IToolAutoUpdateRow,
} from './ToolAutoUpdatePanel.types';

/**
 * Binds the `settings` translator and pre-composes each tool's status line, so
 * the shell renders plain strings. Status lines show only while the setting is
 * on: with it off, "last checked" would describe a feature the user disabled.
 */
export function useToolAutoUpdatePanel({
  enabled,
  disabled,
  onEnabledChange,
  record,
}: IToolAutoUpdatePanelProps): IToolAutoUpdatePanelView {
  const { t, i18n } = useTranslation('settings');
  const format = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const row = (tool: string, entry: ToolUpdateRecord | undefined): IToolAutoUpdateRow => ({
    tool,
    updatedText: entry?.lastUpdatedVersion
      ? t('dl.autoUpdate.updatedTo', { version: entry.lastUpdatedVersion })
      : null,
    checkedText:
      entry?.lastCheckedAt != null
        ? t('dl.autoUpdate.checkedAt', { when: format.format(entry.lastCheckedAt) })
        : t('dl.autoUpdate.notChecked'),
  });

  return {
    label: t('dl.autoUpdate.label'),
    description: t('dl.autoUpdate.description'),
    checked: enabled,
    disabled,
    onCheckedChange: onEnabledChange,
    rows: enabled ? [row('yt-dlp', record?.ytdlp), row('ffmpeg', record?.ffmpeg)] : [],
  };
}
