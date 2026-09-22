import { PictureInPicture2 } from 'lucide-react';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { CompactModePreview } from '@/components/settings/CompactModePreview';
import { useCompactSection } from './CompactSection.hooks';
import type { ICompactPresetOption, ICompactToggle } from './CompactSection.types';

interface ISubsectionProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function Subsection({ title, subtitle, children }: ISubsectionProps) {
  return (
    <div className="space-y-4">
      <div className="px-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/80">
          {title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

interface IPresetControlProps<T extends string> {
  title: string;
  description: string;
  options: readonly ICompactPresetOption<T>[];
  onChange: (value: T) => void;
}

function PresetControl<T extends string>({
  title,
  description,
  options,
  onChange,
}: IPresetControlProps<T>) {
  const chips = options.map(option => (
    <button
      key={option.value}
      onClick={() => onChange(option.value)}
      className={cn(
        'focus-ring rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        option.isActive
          ? 'border border-primary/40 bg-primary/15 text-primary'
          : 'border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      {option.label}
    </button>
  ));

  return (
    <div className="px-3">
      <p className="mb-1 text-sm font-medium text-foreground">{title}</p>
      <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      <div className="flex items-center gap-1.5">{chips}</div>
    </div>
  );
}

interface IOpacityControlProps {
  title: string;
  description: string;
  value: number;
  percent: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function OpacityControl({
  title,
  description,
  value,
  percent,
  min,
  max,
  step,
  onChange,
}: IOpacityControlProps) {
  return (
    <div className="px-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{description}</p>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

function renderToggle(toggle: ICompactToggle) {
  return (
    <SettingsToggleRow
      key={toggle.key}
      divider={toggle.divider}
      label={toggle.label}
      description={toggle.description}
      checked={toggle.checked}
      onCheckedChange={toggle.onChange}
    />
  );
}

export default function CompactSection() {
  const {
    t,
    resetLabel,
    isModified,
    onReset,
    sizeControl,
    onSetSize,
    fontSizeControl,
    onSetFontSize,
    ambientControl,
    onSetAmbientIntensity,
    elementToggles,
    behaviorToggle,
  } = useCompactSection();

  const elementRows = elementToggles.map(renderToggle);

  return (
    <SettingsCard icon={PictureInPicture2} title={t('cmp.title')} subtitle={t('cmp.subtitle')}>
      <div className="space-y-8">
        <CompactModePreview />

        {/* Size + typography */}
        <div className="space-y-5">
          <PresetControl
            title={sizeControl.title}
            description={sizeControl.description}
            options={sizeControl.options}
            onChange={onSetSize}
          />
          <PresetControl
            title={fontSizeControl.title}
            description={fontSizeControl.description}
            options={fontSizeControl.options}
            onChange={onSetFontSize}
          />
          <OpacityControl
            title={ambientControl.title}
            description={ambientControl.description}
            value={ambientControl.value}
            percent={ambientControl.percent}
            min={ambientControl.min}
            max={ambientControl.max}
            step={ambientControl.step}
            onChange={onSetAmbientIntensity}
          />
        </div>

        {/* Element visibility */}
        <Subsection title={t('cmp.elements.title')} subtitle={t('cmp.elements.subtitle')}>
          {elementRows}
        </Subsection>

        {/* Behavior */}
        <Subsection title={t('cmp.behavior.title')} subtitle={t('cmp.behavior.subtitle')}>
          {renderToggle(behaviorToggle)}
        </Subsection>

        {isModified && (
          <div className="px-3">
            <button
              onClick={onReset}
              className="focus-ring rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {resetLabel}
            </button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
