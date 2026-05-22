import { Clock, Image, ExternalLink, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsCard } from '@/components/settings/SettingsCard';
import type { DiscordMusicActivityType, DiscordPresenceTemplate } from '@shiranami/shared';
import { DISCORD_ACTIVITY_TYPES, DISCORD_TEMPLATE_VARIABLES } from '@shiranami/shared';

interface DiscordTemplateEditorProps {
  selectedActivity: DiscordMusicActivityType;
  onActivityChange: (activity: DiscordMusicActivityType) => void;
  currentTemplate: DiscordPresenceTemplate;
  onTemplateChange: (
    type: DiscordMusicActivityType,
    field: keyof DiscordPresenceTemplate,
    value: string | boolean
  ) => void;
  onReset: () => void;
}

/** Small toggle row for template options. */
function TemplateToggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm">{label}</span>
      </div>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function DiscordTemplateEditor({
  selectedActivity,
  onActivityChange,
  currentTemplate,
  onTemplateChange,
  onReset,
}: DiscordTemplateEditorProps) {
  const { t } = useTranslation('settings');

  return (
    <SettingsCard
      icon={MessageCircle}
      title={t('dsc.editor.title')}
      subtitle={t('dsc.editor.subtitle')}
    >
      {/* Activity type selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {t('dsc.editor.activityType')}
        </label>
        <Select
          value={selectedActivity}
          onValueChange={v => onActivityChange(v as DiscordMusicActivityType)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DISCORD_ACTIVITY_TYPES.map(type => (
              <SelectItem key={type} value={type}>
                {t(`dsc.activityLabel.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border-t border-border/50" />

      {/* Template inputs */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t('dsc.editor.line1')}
          </label>
          <Input
            className="h-8 text-sm"
            value={currentTemplate.details}
            onChange={e => onTemplateChange(selectedActivity, 'details', e.target.value)}
            placeholder={t('dsc.editor.line1Placeholder')}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t('dsc.editor.line2')}
          </label>
          <Input
            className="h-8 text-sm"
            value={currentTemplate.state}
            onChange={e => onTemplateChange(selectedActivity, 'state', e.target.value)}
            placeholder={t('dsc.editor.line2Placeholder')}
          />
        </div>
      </div>

      {/* Template toggles */}
      <div className="space-y-2">
        <TemplateToggle
          icon={Clock}
          label={t('dsc.editor.toggles.duration')}
          checked={currentTemplate.showTimestamp}
          onChange={v => onTemplateChange(selectedActivity, 'showTimestamp', v)}
        />
        <TemplateToggle
          icon={Image}
          label={t('dsc.editor.toggles.cover')}
          checked={currentTemplate.showLargeImage}
          onChange={v => onTemplateChange(selectedActivity, 'showLargeImage', v)}
        />
        <TemplateToggle
          icon={ExternalLink}
          label={t('dsc.editor.toggles.landingButton')}
          checked={currentTemplate.showButton}
          onChange={v => onTemplateChange(selectedActivity, 'showButton', v)}
        />
      </div>

      {/* Available variables */}
      <div className="space-y-1.5 rounded-lg bg-muted/30 p-3">
        <p className="text-xs font-medium text-muted-foreground">
          {t('dsc.editor.variablesLabel')}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {DISCORD_TEMPLATE_VARIABLES.map(v => (
            <span key={v.key} className="text-xs text-muted-foreground">
              <code className="rounded bg-primary/5 px-1 text-[10px] text-primary/80">{v.key}</code>{' '}
              · {t(v.descriptionKey)}
            </span>
          ))}
        </div>
      </div>

      {/* Reset button */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="text-xs" onClick={onReset}>
          {t('dsc.editor.resetDefaults')}
        </Button>
      </div>
    </SettingsCard>
  );
}
