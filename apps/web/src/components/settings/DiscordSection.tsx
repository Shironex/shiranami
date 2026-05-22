import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { DiscordPreview } from '@/components/settings/DiscordPreview';
import { DiscordTemplateEditor } from '@/components/settings/DiscordTemplateEditor';
import { substitutePreview } from '@/lib/discord-utils';
import { IS_ELECTRON } from '@/lib/platform';
import { useUpdateDiscordRpcSettingsMutation } from '@/hooks/queries/useDiscordRpc';
import type {
  DiscordRpcSettings,
  DiscordMusicActivityType,
  DiscordPresenceTemplate,
} from '@shiranami/shared';
import { DEFAULT_DISCORD_TEMPLATES } from '@shiranami/shared';

export function DiscordSection() {
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

  const updateField = useCallback(
    <K extends keyof DiscordRpcSettings>(key: K, value: DiscordRpcSettings[K]) => {
      setSettings(prev => (prev ? { ...prev, [key]: value } : prev));
    },
    []
  );

  const updateTemplate = useCallback(
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

  const handleSave = useCallback(async () => {
    if (!settings) return;
    await updateDiscord.mutateAsync(settings);
    if (!mountedRef.current) return;
    setSaved(true);
    setTimeout(() => {
      if (mountedRef.current) setSaved(false);
    }, 2000);
  }, [settings, updateDiscord]);

  const handleResetTemplate = useCallback(() => {
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

  if (!settings) return null;

  const showCustomTemplateEditing = settings.enabled && settings.useCustomTemplates;

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={MessageCircle}
        title={t('discord.main.title')}
        subtitle={t('discord.main.subtitle')}
        headerRight={
          <Switch
            aria-label={t('discord.main.enableAria')}
            checked={settings.enabled}
            onCheckedChange={v => updateField('enabled', v)}
          />
        }
      >
        {!settings.useCustomTemplates && (
          <>
            <SettingsToggleRow
              label={t('discord.main.showDetailsTitle')}
              description={t('discord.main.showDetailsDescription')}
              checked={settings.showTrackDetails}
              onCheckedChange={v => updateField('showTrackDetails', v)}
              disabled={!settings.enabled}
            />
            <SettingsToggleRow
              divider
              label={t('discord.main.showTimeTitle')}
              description={t('discord.main.showTimeDescription')}
              checked={settings.showElapsedTime}
              onCheckedChange={v => updateField('showElapsedTime', v)}
              disabled={!settings.enabled}
            />
          </>
        )}

        <SettingsToggleRow
          divider={!settings.useCustomTemplates}
          label={t('discord.main.useTemplatesTitle')}
          description={t('discord.main.useTemplatesDescription')}
          checked={settings.useCustomTemplates}
          onCheckedChange={v => updateField('useCustomTemplates', v)}
          disabled={!settings.enabled}
        />

        <Button size="sm" onClick={handleSave}>
          {saved ? <Check className="h-4 w-4" /> : null}
          {saved ? t('discord.main.saved') : t('discord.main.save')}
        </Button>
      </SettingsCard>

      {showCustomTemplateEditing && (
        <>
          <DiscordTemplateEditor
            selectedActivity={selectedActivity}
            onActivityChange={setSelectedActivity}
            currentTemplate={currentTemplate}
            onTemplateChange={updateTemplate}
            onReset={handleResetTemplate}
          />
          <SettingsCard
            icon={MessageCircle}
            title={t('discord.preview.title')}
            subtitle={t('discord.preview.subtitle')}
          >
            <DiscordPreview
              details={previewDetails}
              state={previewState}
              showTimestamp={currentTemplate.showTimestamp}
              showLargeImage={currentTemplate.showLargeImage}
              showButton={currentTemplate.showButton}
            />
          </SettingsCard>
        </>
      )}

      <div className="flex items-start gap-2.5 rounded-xl border border-border/30 bg-surface/50 p-4 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/80" />
        <p className="leading-relaxed">{t('discord.info')}</p>
      </div>
    </div>
  );
}
