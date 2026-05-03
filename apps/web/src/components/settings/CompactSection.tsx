import { useTranslation } from 'react-i18next';
import { PictureInPicture2 } from 'lucide-react';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import {
  useCompactStore,
  COMPACT_AMBIENT_INTENSITY_MIN,
  COMPACT_AMBIENT_INTENSITY_MAX,
  COMPACT_AMBIENT_INTENSITY_STEP,
  COMPACT_AMBIENT_INTENSITY_DEFAULT,
  COMPACT_SIZE_DEFAULT,
  COMPACT_FONT_SIZE_DEFAULT,
  type CompactSize,
  type CompactFontSize,
} from '@/stores/useCompactStore';
import { cn } from '@/lib/utils';
import { CompactModePreview } from '@/components/settings/CompactModePreview';

const SIZES: CompactSize[] = ['sm', 'md', 'lg'];
const FONT_SIZES: CompactFontSize[] = ['sm', 'md', 'lg'];

export function CompactSection() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');

  const compactSize = useCompactStore(s => s.compactSize);
  const compactFontSize = useCompactStore(s => s.compactFontSize);
  const compactAmbientIntensity = useCompactStore(s => s.compactAmbientIntensity);
  const compactShowAlbumArt = useCompactStore(s => s.compactShowAlbumArt);
  const compactShowAlbum = useCompactStore(s => s.compactShowAlbum);
  const compactShowSeek = useCompactStore(s => s.compactShowSeek);
  const compactShowVolume = useCompactStore(s => s.compactShowVolume);
  const compactShowFavorite = useCompactStore(s => s.compactShowFavorite);
  const compactDefaultAlwaysOnTop = useCompactStore(s => s.compactDefaultAlwaysOnTop);

  const setCompactSize = useCompactStore(s => s.setCompactSize);
  const setCompactFontSize = useCompactStore(s => s.setCompactFontSize);
  const setCompactAmbientIntensity = useCompactStore(s => s.setCompactAmbientIntensity);
  const setCompactShowAlbumArt = useCompactStore(s => s.setCompactShowAlbumArt);
  const setCompactShowAlbum = useCompactStore(s => s.setCompactShowAlbum);
  const setCompactShowSeek = useCompactStore(s => s.setCompactShowSeek);
  const setCompactShowVolume = useCompactStore(s => s.setCompactShowVolume);
  const setCompactShowFavorite = useCompactStore(s => s.setCompactShowFavorite);
  const setCompactDefaultAlwaysOnTop = useCompactStore(s => s.setCompactDefaultAlwaysOnTop);
  const resetCompactAppearance = useCompactStore(s => s.resetCompactAppearance);

  const isModified =
    compactSize !== COMPACT_SIZE_DEFAULT ||
    compactFontSize !== COMPACT_FONT_SIZE_DEFAULT ||
    compactAmbientIntensity !== COMPACT_AMBIENT_INTENSITY_DEFAULT ||
    !compactShowAlbumArt ||
    !compactShowAlbum ||
    !compactShowSeek ||
    !compactShowVolume ||
    compactShowFavorite ||
    compactDefaultAlwaysOnTop;

  return (
    <SettingsCard icon={PictureInPicture2} title={t('cmp.title')} subtitle={t('cmp.subtitle')}>
      <div className="space-y-8">
        <CompactModePreview />

        {/* Size + typography */}
        <div className="space-y-5">
          <PresetControl
            title={t('cmp.size.title')}
            description={t('cmp.size.desc')}
            options={SIZES}
            labelKey="cmp.size"
            value={compactSize}
            onChange={setCompactSize}
          />
          <PresetControl
            title={t('cmp.fontSize.title')}
            description={t('cmp.fontSize.desc')}
            options={FONT_SIZES}
            labelKey="cmp.fontSize"
            value={compactFontSize}
            onChange={setCompactFontSize}
          />
          <OpacityControl
            title={t('cmp.ambient.title')}
            description={t('cmp.ambient.desc')}
            value={compactAmbientIntensity}
            min={COMPACT_AMBIENT_INTENSITY_MIN}
            max={COMPACT_AMBIENT_INTENSITY_MAX}
            step={COMPACT_AMBIENT_INTENSITY_STEP}
            onChange={setCompactAmbientIntensity}
          />
        </div>

        {/* Element visibility */}
        <Subsection title={t('cmp.elements.title')} subtitle={t('cmp.elements.subtitle')}>
          <SettingsToggleRow
            label={t('cmp.elements.albumArt')}
            description={t('cmp.elements.albumArtDesc')}
            checked={compactShowAlbumArt}
            onCheckedChange={setCompactShowAlbumArt}
          />
          <SettingsToggleRow
            divider
            label={t('cmp.elements.album')}
            description={t('cmp.elements.albumDesc')}
            checked={compactShowAlbum}
            onCheckedChange={setCompactShowAlbum}
          />
          <SettingsToggleRow
            divider
            label={t('cmp.elements.seek')}
            description={t('cmp.elements.seekDesc')}
            checked={compactShowSeek}
            onCheckedChange={setCompactShowSeek}
          />
          <SettingsToggleRow
            divider
            label={t('cmp.elements.volume')}
            description={t('cmp.elements.volumeDesc')}
            checked={compactShowVolume}
            onCheckedChange={setCompactShowVolume}
          />
          <SettingsToggleRow
            divider
            label={t('cmp.elements.favorite')}
            description={t('cmp.elements.favoriteDesc')}
            checked={compactShowFavorite}
            onCheckedChange={setCompactShowFavorite}
          />
        </Subsection>

        {/* Behavior */}
        <Subsection title={t('cmp.behavior.title')} subtitle={t('cmp.behavior.subtitle')}>
          <SettingsToggleRow
            label={t('cmp.behavior.defaultAlwaysOnTop')}
            description={t('cmp.behavior.defaultAlwaysOnTopDesc')}
            checked={compactDefaultAlwaysOnTop}
            onCheckedChange={setCompactDefaultAlwaysOnTop}
          />
        </Subsection>

        {isModified && (
          <div className="px-3">
            <button
              onClick={resetCompactAppearance}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
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

interface PresetControlProps<T extends string> {
  title: string;
  description: string;
  options: readonly T[];
  /** i18n key prefix; the lookup is `${labelKey}.${option}`. */
  labelKey: string;
  value: T;
  onChange: (value: T) => void;
}

function PresetControl<T extends string>({
  title,
  description,
  options,
  labelKey,
  value,
  onChange,
}: PresetControlProps<T>) {
  const { t } = useTranslation('settings');
  return (
    <div className="px-3">
      <p className="mb-1 text-sm font-medium text-foreground">{title}</p>
      <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      <div className="flex items-center gap-1.5">
        {options.map(option => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              value === option
                ? 'border border-primary/40 bg-primary/15 text-primary'
                : 'border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            {t(`${labelKey}.${option}`)}
          </button>
        ))}
      </div>
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
  // Show as percent of max so users can read the slider as a 0–100 dial.
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
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

export default CompactSection;
