import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { substitutePreview } from '@/lib/discord-utils';
import { IS_ELECTRON } from '@/lib/platform';
import { useUpdateDiscordRpcSettingsMutation } from '@/hooks/queries/useDiscordRpc';
import type {
  DiscordRpcSettings,
  DiscordMusicActivityType,
  DiscordPresenceTemplate,
} from '@shiranami/shared';
import { DEFAULT_DISCORD_TEMPLATES, DISCORD_ACTIVITY_TYPES } from '@shiranami/shared';
import type { IDiscordSectionView } from './DiscordSection.types';

export function useDiscordSection(): IDiscordSectionView {
  const { t } = useTranslation('settings');
  const updateDiscord = useUpdateDiscordRpcSettingsMutation();
  const [settings, setSettings] = useState<DiscordRpcSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<DiscordMusicActivityType>('playing');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    window.electronAPI.discord.getSettings().then(s => {
      if (!mountedRef.current || !s) return;
      setSettings({
        ...s,
        templates: { ...DEFAULT_DISCORD_TEMPLATES, ...s.templates },
      });
    });
  }, []);

  const onUpdateField = useCallback(
    <K extends keyof DiscordRpcSettings>(key: K, value: DiscordRpcSettings[K]) => {
      setSettings(prev => (prev ? { ...prev, [key]: value } : prev));
    },
    []
  );

  const onUpdateTemplate = useCallback(
    (
      type: DiscordMusicActivityType,
      field: keyof DiscordPresenceTemplate,
      value: string | boolean
    ) => {
      setSettings(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          templates: {
            ...prev.templates,
            [type]: { ...prev.templates[type], [field]: value },
          },
        };
      });
    },
    []
  );

  const onSave = useCallback(async () => {
    if (!settings) return;
    try {
      await updateDiscord.mutateAsync(settings);
    } catch {
      // The mutation's onError already surfaced a toast; just don't show "Saved".
      return;
    }
    if (!mountedRef.current) return;
    setSaved(true);
    setTimeout(() => {
      if (mountedRef.current) setSaved(false);
    }, 2000);
  }, [settings, updateDiscord]);

  const onResetTemplate = useCallback(() => {
    setSettings(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        templates: {
          ...prev.templates,
          [selectedActivity]: { ...DEFAULT_DISCORD_TEMPLATES[selectedActivity] },
        },
      };
    });
  }, [selectedActivity]);

  const currentTemplate =
    settings?.templates?.[selectedActivity] ?? DEFAULT_DISCORD_TEMPLATES[selectedActivity];

  const previewDetails = useMemo(
    () => substitutePreview(currentTemplate.details, selectedActivity),
    [currentTemplate.details, selectedActivity]
  );
  const previewState = useMemo(
    () => substitutePreview(currentTemplate.state, selectedActivity),
    [currentTemplate.state, selectedActivity]
  );

  const activityChips = DISCORD_ACTIVITY_TYPES.map(type => ({
    value: type,
    label: t(`dsc.activityLabel.${type}`),
    isActive: selectedActivity === type,
  }));

  const showCustomTemplateEditing = Boolean(
    settings && settings.enabled && settings.useCustomTemplates
  );

  return {
    t,
    settings,
    saved,
    isSaving: updateDiscord.isPending,
    selectedActivity,
    activityChips,
    showCustomTemplateEditing,
    currentTemplate,
    previewDetails,
    previewState,
    onUpdateField,
    onUpdateTemplate,
    onSelectActivity: setSelectedActivity,
    onSave: () => void onSave(),
    onResetTemplate,
  };
}
