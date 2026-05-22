import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  SettingsCard,
  SettingsInfoCallout,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
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
import { DEFAULT_DISCORD_TEMPLATES, DISCORD_ACTIVITY_TYPES } from '@shiranami/shared';

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
        title={t('dsc.main.title')}
        subtitle={t('dsc.main.subtitle')}
        headerRight={
          <Switch
            aria-label={t('dsc.main.enableAria')}
            checked={settings.enabled}
            onCheckedChange={v => updateField('enabled', v)}
          />
        }
      >
        {!settings.useCustomTemplates && (
          <>
            <SettingsToggleRow
              label={t('dsc.main.showDetailsTitle')}
              description={t('dsc.main.showDetailsDescription')}
              checked={settings.showTrackDetails}
              onCheckedChange={v => updateField('showTrackDetails', v)}
              disabled={!settings.enabled}
            />
            <SettingsToggleRow
              divider
              label={t('dsc.main.showTimeTitle')}
              description={t('dsc.main.showTimeDescription')}
              checked={settings.showElapsedTime}
              onCheckedChange={v => updateField('showElapsedTime', v)}
              disabled={!settings.enabled}
            />
          </>
        )}

        <SettingsToggleRow
          divider={!settings.useCustomTemplates}
          label={t('dsc.main.useTemplatesTitle')}
          description={t('dsc.main.useTemplatesDescription')}
          checked={settings.useCustomTemplates}
          onCheckedChange={v => updateField('useCustomTemplates', v)}
          disabled={!settings.enabled}
        />

        <Button size="sm" onClick={handleSave}>
          {saved ? <Check className="h-4 w-4" /> : null}
          {saved ? t('dsc.main.saved') : t('dsc.main.save')}
        </Button>
      </SettingsCard>

      {settings.enabled && (
        <SettingsCard
          icon={MessageCircle}
          title={t('dsc.preview.title')}
          subtitle={t('dsc.preview.subtitle')}
          tone="info"
        >
          {/* Activity-type chip row so the preview reflects the selected state. */}
          <div className="flex gap-1.5 flex-wrap">
            {DISCORD_ACTIVITY_TYPES.map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedActivity(type)}
                aria-pressed={selectedActivity === type}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                  selectedActivity === type
                    ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                )}
              >
                {t(`dsc.activityLabel.${type}`)}
              </button>
            ))}
          </div>
          <DiscordPreview
            details={previewDetails}
            state={previewState}
            showTimestamp={currentTemplate.showTimestamp}
            showLargeImage={currentTemplate.showLargeImage}
            showButton={currentTemplate.showButton}
          />
        </SettingsCard>
      )}

      {showCustomTemplateEditing && (
        <DiscordTemplateEditor
          selectedActivity={selectedActivity}
          onActivityChange={setSelectedActivity}
          currentTemplate={currentTemplate}
          onTemplateChange={updateTemplate}
          onReset={handleResetTemplate}
        />
      )}

      <SettingsInfoCallout icon={Info}>{t('dsc.info')}</SettingsInfoCallout>
    </div>
  );
}
