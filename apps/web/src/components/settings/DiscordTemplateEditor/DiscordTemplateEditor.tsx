import { Clock, Image, ExternalLink, MessageCircle } from 'lucide-react';
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
import type { DiscordMusicActivityType } from '@shiranami/shared';
import { useDiscordTemplateEditor } from './DiscordTemplateEditor.hooks';
import type { IDiscordTemplateEditorProps } from './DiscordTemplateEditor.types';

/** Small toggle row for template options. */
interface ITemplateToggleProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function TemplateToggle({ icon: Icon, label, checked, onChange }: ITemplateToggleProps) {
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

export default function DiscordTemplateEditor({
  selectedActivity,
  onActivityChange,
  currentTemplate,
  onTemplateChange,
  onReset,
}: IDiscordTemplateEditorProps) {
  const { t, activityOptions, variableHints } = useDiscordTemplateEditor();

  const activityItems = activityOptions.map(option => (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  ));

  const variableChips = variableHints.map(hint => (
    <span key={hint.key} className="text-xs text-muted-foreground">
      <code className="rounded bg-primary/5 px-1 text-[10px] text-primary/80">{hint.key}</code> ·{' '}
      {hint.description}
    </span>
  ));

  return (
    <SettingsCard
      icon={MessageCircle}
      title={t('dsc.editor.title')}
      subtitle={t('dsc.editor.subtitle')}
    >
      {/* Activity type selector */}
      <div className="space-y-1.5">
        <label
          htmlFor="discord-activity-type"
          className="text-xs font-medium text-muted-foreground"
        >
          {t('dsc.editor.activityType')}
        </label>
        <Select
          value={selectedActivity}
          onValueChange={v => onActivityChange(v as DiscordMusicActivityType)}
        >
          <SelectTrigger id="discord-activity-type" className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{activityItems}</SelectContent>
        </Select>
      </div>

      <div className="border-t border-border/50" />

      {/* Template inputs */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="discord-line1" className="text-xs font-medium text-muted-foreground">
            {t('dsc.editor.line1')}
          </label>
          <Input
            id="discord-line1"
            className="h-8 text-sm"
            value={currentTemplate.details}
            onChange={e => onTemplateChange(selectedActivity, 'details', e.target.value)}
            placeholder={t('dsc.editor.line1Placeholder')}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="discord-line2" className="text-xs font-medium text-muted-foreground">
            {t('dsc.editor.line2')}
          </label>
          <Input
            id="discord-line2"
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
        <div className="flex flex-wrap gap-x-4 gap-y-1">{variableChips}</div>
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
