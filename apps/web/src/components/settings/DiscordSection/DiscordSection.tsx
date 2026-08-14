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
import { useDiscordSection } from './DiscordSection.hooks';

export default function DiscordSection() {
  const {
    t,
    settings,
    saved,
    isSaving,
    selectedActivity,
    activityChips,
    showCustomTemplateEditing,
    currentTemplate,
    previewDetails,
    previewState,
    onUpdateField,
    onUpdateTemplate,
    onSelectActivity,
    onSave,
    onResetTemplate,
  } = useDiscordSection();

  if (!settings) return null;

  const chipButtons = activityChips.map(chip => (
    <button
      key={chip.value}
      type="button"
      onClick={() => onSelectActivity(chip.value)}
      aria-pressed={chip.isActive}
      className={cn(
        'focus-ring rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
        chip.isActive
          ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400'
          : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
      )}
    >
      {chip.label}
    </button>
  ));

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
            onCheckedChange={v => onUpdateField('enabled', v)}
          />
        }
      >
        {!settings.useCustomTemplates && (
          <>
            <SettingsToggleRow
              label={t('dsc.main.showDetailsTitle')}
              description={t('dsc.main.showDetailsDescription')}
              checked={settings.showTrackDetails}
              onCheckedChange={v => onUpdateField('showTrackDetails', v)}
              disabled={!settings.enabled}
            />
            <SettingsToggleRow
              divider
              label={t('dsc.main.showTimeTitle')}
              description={t('dsc.main.showTimeDescription')}
              checked={settings.showElapsedTime}
              onCheckedChange={v => onUpdateField('showElapsedTime', v)}
              disabled={!settings.enabled}
            />
          </>
        )}

        <SettingsToggleRow
          divider={!settings.useCustomTemplates}
          label={t('dsc.main.useTemplatesTitle')}
          description={t('dsc.main.useTemplatesDescription')}
          checked={settings.useCustomTemplates}
          onCheckedChange={v => onUpdateField('useCustomTemplates', v)}
          disabled={!settings.enabled}
        />

        <Button size="sm" onClick={onSave} disabled={isSaving}>
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
          <div className="flex gap-1.5 flex-wrap">{chipButtons}</div>
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
          onActivityChange={onSelectActivity}
          currentTemplate={currentTemplate}
          onTemplateChange={onUpdateTemplate}
          onReset={onResetTemplate}
        />
      )}

      <SettingsInfoCallout icon={Info}>{t('dsc.info')}</SettingsInfoCallout>
    </div>
  );
}
