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
  LYR_SIZE_CLASS,
  type LyricsPlainFontSize,
} from '@/stores/useAppStore';
import { cn } from '@/lib/utils';

const FONT_SIZES: LyricsPlainFontSize[] = ['sm', 'base', 'lg', 'xl'];

export function LyricsSection() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const lyricsPlainOpacity = useAppStore(s => s.lyricsPlainOpacity);
  const lyricsPlainFontSize = useAppStore(s => s.lyricsPlainFontSize);
  const setLyricsPlainOpacity = useAppStore(s => s.setLyricsPlainOpacity);
  const setLyricsPlainFontSize = useAppStore(s => s.setLyricsPlainFontSize);
  const resetLyricsPlainAppearance = useAppStore(s => s.resetLyricsPlainAppearance);

  const isModified =
    lyricsPlainOpacity !== LYRICS_PLAIN_OPACITY_DEFAULT ||
    lyricsPlainFontSize !== LYRICS_PLAIN_FONT_SIZE_DEFAULT;

  const opacityPercent = Math.round(lyricsPlainOpacity * 100);

  return (
    <SettingsCard icon={Captions} title={t('lyr.title')} subtitle={t('lyr.subtitle')}>
      <div className="space-y-6">
        {/* Opacity */}
        <div className="px-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-foreground">{t('lyr.plain.opacityTitle')}</p>
            <span className="text-xs tabular-nums text-muted-foreground">{opacityPercent}%</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{t('lyr.plain.opacityDesc')}</p>

          <Slider
            min={LYRICS_PLAIN_OPACITY_MIN}
            max={LYRICS_PLAIN_OPACITY_MAX}
            step={LYRICS_PLAIN_OPACITY_STEP}
            value={[lyricsPlainOpacity]}
            onValueChange={([v]) => setLyricsPlainOpacity(v)}
          />
        </div>

        {/* Font size */}
        <div className="px-3">
          <p className="text-sm font-medium text-foreground mb-1">{t('lyr.plain.fontSizeTitle')}</p>
          <p className="text-xs text-muted-foreground mb-3">{t('lyr.plain.fontSizeDesc')}</p>
          <div className="flex items-center gap-1.5">
            {FONT_SIZES.map(size => (
              <button
                key={size}
                onClick={() => setLyricsPlainFontSize(size)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  lyricsPlainFontSize === size
                    ? 'bg-primary/15 text-primary border border-primary/40'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                )}
              >
                {t(`lyr.size.${size}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Reset */}
        {isModified && (
          <div className="px-3 -mt-2">
            <button
              onClick={resetLyricsPlainAppearance}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {tc('reset')}
            </button>
          </div>
        )}

        {/* Preview */}
        <div className="px-3">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">
            {t('lyr.previewTitle')}
          </p>
          <LyricsPreview opacity={lyricsPlainOpacity} fontSize={lyricsPlainFontSize} />
        </div>
      </div>
    </SettingsCard>
  );
}

interface LyricsPreviewProps {
  opacity: number;
  fontSize: LyricsPlainFontSize;
}

function LyricsPreview({ opacity, fontSize }: LyricsPreviewProps) {
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

export default LyricsSection;
