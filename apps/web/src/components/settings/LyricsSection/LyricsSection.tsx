import { Captions } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { Slider } from '@/components/ui/slider';
import {
  LYR_SIZE_CLASS,
  LYRICS_SYNCED_PAST_RATIO,
  nextLyricsFontSize,
  type LyricsFontSize,
} from '@/stores/useLyricsAppearanceStore';
import { cn } from '@/lib/utils';
import { useLyricsSection } from './LyricsSection.hooks';

const FONT_SIZES: LyricsFontSize[] = ['sm', 'base', 'lg', 'xl'];

export default function LyricsSection() {
  const {
    t,
    resetLabel,
    preferSyncedFromLrclib,
    preferSyncedDisabled,
    onSetPreferSyncedFromLrclib,
    lyricsPlainOpacity,
    lyricsPlainFontSize,
    onSetPlainOpacity,
    onSetPlainFontSize,
    plainOpacityMin,
    plainOpacityMax,
    plainOpacityStep,
    lyricsSyncedDimOpacity,
    lyricsSyncedFontSize,
    onSetSyncedDimOpacity,
    onSetSyncedFontSize,
    syncedDimOpacityMin,
    syncedDimOpacityMax,
    syncedDimOpacityStep,
    isModified,
    onReset,
  } = useLyricsSection();

  return (
    <SettingsCard icon={Captions} title={t('lyr.title')} subtitle={t('lyr.subtitle')}>
      <div className="space-y-8">
        {/* Sources subsection */}
        <Subsection title={t('lyr.sources.title')} subtitle={t('lyr.sources.subtitle')}>
          <SettingsToggleRow
            label={t('lyr.sources.preferSyncedTitle')}
            description={t('lyr.sources.preferSyncedDesc')}
            checked={preferSyncedFromLrclib}
            onCheckedChange={onSetPreferSyncedFromLrclib}
            disabled={preferSyncedDisabled}
          />
        </Subsection>

        {/* Plain text subsection */}
        <Subsection title={t('lyr.plain.title')} subtitle={t('lyr.plain.subtitle')}>
          <OpacityControl
            title={t('lyr.plain.opacityTitle')}
            description={t('lyr.plain.opacityDesc')}
            value={lyricsPlainOpacity}
            min={plainOpacityMin}
            max={plainOpacityMax}
            step={plainOpacityStep}
            onChange={onSetPlainOpacity}
          />
          <FontSizeControl
            title={t('lyr.plain.fontSizeTitle')}
            description={t('lyr.plain.fontSizeDesc')}
            value={lyricsPlainFontSize}
            onChange={onSetPlainFontSize}
          />
          <SettingsPreview title={t('lyr.previewTitle')}>
            <PlainPreview opacity={lyricsPlainOpacity} fontSize={lyricsPlainFontSize} />
          </SettingsPreview>
        </Subsection>

        {/* Synced lyrics subsection */}
        <Subsection title={t('lyr.synced.title')} subtitle={t('lyr.synced.subtitle')}>
          <OpacityControl
            title={t('lyr.synced.opacityTitle')}
            description={t('lyr.synced.opacityDesc')}
            value={lyricsSyncedDimOpacity}
            min={syncedDimOpacityMin}
            max={syncedDimOpacityMax}
            step={syncedDimOpacityStep}
            onChange={onSetSyncedDimOpacity}
          />
          <FontSizeControl
            title={t('lyr.synced.fontSizeTitle')}
            description={t('lyr.synced.fontSizeDesc')}
            value={lyricsSyncedFontSize}
            onChange={onSetSyncedFontSize}
          />
          <SettingsPreview title={t('lyr.previewTitle')}>
            <SyncedPreview dimOpacity={lyricsSyncedDimOpacity} fontSize={lyricsSyncedFontSize} />
          </SettingsPreview>
        </Subsection>

        {/* Unified reset — restores all four lyrics prefs */}
        {isModified && (
          <div className="px-3">
            <button
              onClick={onReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {resetLabel}
            </button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

interface ISubsectionProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function Subsection({ title, subtitle, children }: ISubsectionProps) {
  return (
    <div className="space-y-5">
      <div className="px-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/80">
          {title}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

interface IOpacityControlProps {
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function OpacityControl({
  title,
  description,
  value,
  min,
  max,
  step,
  onChange,
}: IOpacityControlProps) {
  const percent = Math.round(value * 100);
  return (
    <div className="px-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{description}</p>
      <Slider
        aria-label={title}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

interface IFontSizeControlProps {
  title: string;
  description: string;
  value: LyricsFontSize;
  onChange: (size: LyricsFontSize) => void;
}

function FontSizeControl({ title, description, value, onChange }: IFontSizeControlProps) {
  const { t } = useTranslation('settings');
  const sizeButtons = FONT_SIZES.map(size => (
    <button
      key={size}
      type="button"
      role="radio"
      aria-checked={value === size}
      onClick={() => onChange(size)}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
        value === size
          ? 'bg-primary/15 text-primary border border-primary/40'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
      )}
    >
      {t(`lyr.size.${size}`)}
    </button>
  ));
  return (
    <div className="px-3">
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label={title}>
        {sizeButtons}
      </div>
    </div>
  );
}

interface IPlainPreviewProps {
  opacity: number;
  fontSize: LyricsFontSize;
}

function PlainPreview({ opacity, fontSize }: IPlainPreviewProps) {
  const { t } = useTranslation('settings');
  const previewText = `${t('lyr.previewLine1')}\n${t('lyr.previewLine2')}\n${t('lyr.previewLine3')}\n${t('lyr.previewLine4')}`;
  return (
    <div className="bg-surface/40 border border-border/30 rounded-xl px-4 py-4">
      <pre
        className={cn(
          'text-foreground whitespace-pre-wrap font-sans font-medium tracking-[0.005em]',
          LYR_SIZE_CLASS[fontSize]
        )}
        style={{ opacity }}
      >
        {previewText}
      </pre>
    </div>
  );
}

interface ISyncedPreviewProps {
  dimOpacity: number;
  fontSize: LyricsFontSize;
}

function SyncedPreview({ dimOpacity, fontSize }: ISyncedPreviewProps) {
  const { t } = useTranslation('settings');
  const baseClass = LYR_SIZE_CLASS[fontSize];
  const activeClass = LYR_SIZE_CLASS[nextLyricsFontSize(fontSize)];
  // Mirror the runtime ratio so preview past-line dimness tracks the panel.
  const pastOpacity = dimOpacity * LYRICS_SYNCED_PAST_RATIO;

  return (
    <div className="bg-surface/40 border border-border/30 rounded-xl px-4 py-4 space-y-3">
      <p
        className={cn('text-foreground font-medium leading-relaxed', baseClass)}
        style={{ opacity: pastOpacity }}
      >
        {t('lyr.previewSyncedPast')}
      </p>
      <p
        className={cn('text-foreground font-medium leading-relaxed', baseClass)}
        style={{ opacity: dimOpacity }}
      >
        {t('lyr.previewSyncedIdleA')}
      </p>
      <p className={cn('text-foreground font-semibold leading-relaxed', activeClass)}>
        {t('lyr.previewSyncedActive')}
      </p>
      <p
        className={cn('text-foreground font-medium leading-relaxed', baseClass)}
        style={{ opacity: dimOpacity }}
      >
        {t('lyr.previewSyncedIdleB')}
      </p>
    </div>
  );
}
