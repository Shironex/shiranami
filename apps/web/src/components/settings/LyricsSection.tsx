import { useTranslation } from 'react-i18next';
import { Captions } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import {
  useAppStore,
  LYRICS_PLAIN_OPACITY_MIN,
  LYRICS_PLAIN_OPACITY_MAX,
  LYRICS_PLAIN_OPACITY_STEP,
  LYRICS_PLAIN_OPACITY_DEFAULT,
  LYRICS_PLAIN_FONT_SIZE_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_MIN,
  LYRICS_SYNCED_DIM_OPACITY_MAX,
  LYRICS_SYNCED_DIM_OPACITY_STEP,
  LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
  LYRICS_SYNCED_FONT_SIZE_DEFAULT,
  LYRICS_SYNCED_PAST_RATIO,
  LYR_SIZE_CLASS,
  nextLyricsFontSize,
  type LyricsFontSize,
} from '@/stores/useAppStore';
import { cn } from '@/lib/utils';

const FONT_SIZES: LyricsFontSize[] = ['sm', 'base', 'lg', 'xl'];

export function LyricsSection() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');

  const lyricsPlainOpacity = useAppStore(s => s.lyricsPlainOpacity);
  const lyricsPlainFontSize = useAppStore(s => s.lyricsPlainFontSize);
  const setLyricsPlainOpacity = useAppStore(s => s.setLyricsPlainOpacity);
  const setLyricsPlainFontSize = useAppStore(s => s.setLyricsPlainFontSize);

  const lyricsSyncedDimOpacity = useAppStore(s => s.lyricsSyncedDimOpacity);
  const lyricsSyncedFontSize = useAppStore(s => s.lyricsSyncedFontSize);
  const setLyricsSyncedDimOpacity = useAppStore(s => s.setLyricsSyncedDimOpacity);
  const setLyricsSyncedFontSize = useAppStore(s => s.setLyricsSyncedFontSize);

  const resetLyricsAppearance = useAppStore(s => s.resetLyricsAppearance);

  const isModified =
    lyricsPlainOpacity !== LYRICS_PLAIN_OPACITY_DEFAULT ||
    lyricsPlainFontSize !== LYRICS_PLAIN_FONT_SIZE_DEFAULT ||
    lyricsSyncedDimOpacity !== LYRICS_SYNCED_DIM_OPACITY_DEFAULT ||
    lyricsSyncedFontSize !== LYRICS_SYNCED_FONT_SIZE_DEFAULT;

  return (
    <SettingsCard icon={Captions} title={t('lyr.title')} subtitle={t('lyr.subtitle')}>
      <div className="space-y-8">
        {/* Plain text subsection */}
        <Subsection title={t('lyr.plain.title')} subtitle={t('lyr.plain.subtitle')}>
          <OpacityControl
            title={t('lyr.plain.opacityTitle')}
            description={t('lyr.plain.opacityDesc')}
            value={lyricsPlainOpacity}
            min={LYRICS_PLAIN_OPACITY_MIN}
            max={LYRICS_PLAIN_OPACITY_MAX}
            step={LYRICS_PLAIN_OPACITY_STEP}
            onChange={setLyricsPlainOpacity}
          />
          <FontSizeControl
            title={t('lyr.plain.fontSizeTitle')}
            description={t('lyr.plain.fontSizeDesc')}
            value={lyricsPlainFontSize}
            onChange={setLyricsPlainFontSize}
          />
          <PreviewSlot title={t('lyr.previewTitle')}>
            <PlainPreview opacity={lyricsPlainOpacity} fontSize={lyricsPlainFontSize} />
          </PreviewSlot>
        </Subsection>

        {/* Synced lyrics subsection */}
        <Subsection title={t('lyr.synced.title')} subtitle={t('lyr.synced.subtitle')}>
          <OpacityControl
            title={t('lyr.synced.opacityTitle')}
            description={t('lyr.synced.opacityDesc')}
            value={lyricsSyncedDimOpacity}
            min={LYRICS_SYNCED_DIM_OPACITY_MIN}
            max={LYRICS_SYNCED_DIM_OPACITY_MAX}
            step={LYRICS_SYNCED_DIM_OPACITY_STEP}
            onChange={setLyricsSyncedDimOpacity}
          />
          <FontSizeControl
            title={t('lyr.synced.fontSizeTitle')}
            description={t('lyr.synced.fontSizeDesc')}
            value={lyricsSyncedFontSize}
            onChange={setLyricsSyncedFontSize}
          />
          <PreviewSlot title={t('lyr.previewTitle')}>
            <SyncedPreview dimOpacity={lyricsSyncedDimOpacity} fontSize={lyricsSyncedFontSize} />
          </PreviewSlot>
        </Subsection>

        {/* Unified reset — restores all four lyrics prefs */}
        {isModified && (
          <div className="px-3">
            <button
              onClick={resetLyricsAppearance}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {tc('reset')}
            </button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

interface SubsectionProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function Subsection({ title, subtitle, children }: SubsectionProps) {
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

interface OpacityControlProps {
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
}: OpacityControlProps) {
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

interface FontSizeControlProps {
  title: string;
  description: string;
  value: LyricsFontSize;
  onChange: (size: LyricsFontSize) => void;
}

function FontSizeControl({ title, description, value, onChange }: FontSizeControlProps) {
  const { t } = useTranslation('settings');
  return (
    <div className="px-3">
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label={title}>
        {FONT_SIZES.map(size => (
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
        ))}
      </div>
    </div>
  );
}

interface PreviewSlotProps {
  title: string;
  children: React.ReactNode;
}

function PreviewSlot({ title, children }: PreviewSlotProps) {
  return (
    <div className="px-3">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}

interface PlainPreviewProps {
  opacity: number;
  fontSize: LyricsFontSize;
}

function PlainPreview({ opacity, fontSize }: PlainPreviewProps) {
  const { t } = useTranslation('settings');
  return (
    <div className="bg-surface/40 border border-border/30 rounded-xl px-4 py-4">
      <pre
        className={cn(
          'text-foreground whitespace-pre-wrap font-sans font-medium tracking-[0.005em]',
          LYR_SIZE_CLASS[fontSize]
        )}
        style={{ opacity }}
      >
        {`${t('lyr.previewLine1')}\n${t('lyr.previewLine2')}\n${t('lyr.previewLine3')}\n${t('lyr.previewLine4')}`}
      </pre>
    </div>
  );
}

interface SyncedPreviewProps {
  dimOpacity: number;
  fontSize: LyricsFontSize;
}

function SyncedPreview({ dimOpacity, fontSize }: SyncedPreviewProps) {
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

export default LyricsSection;
