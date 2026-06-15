import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { EQ_BANDS } from '@/lib/audioAnalyser';
import { formatEqFrequencyTick } from '@/lib/eqLabels';
import { useEqResponseCurve } from '@/hooks/useEqResponseCurve';
import type { IEqCurvePreviewProps, IEqCurvePreviewView } from './EqCurvePreview.types';

const VIEW_W = 320;
const VIEW_H = 96;

/** Dimensions of the SVG viewBox the curve is drawn into. */
export const EQ_CURVE_VIEWBOX = { width: VIEW_W, height: VIEW_H } as const;

export function useEqCurvePreview({
  gains,
  preampDb,
  disabled = false,
}: IEqCurvePreviewProps): IEqCurvePreviewView {
  const { t } = useTranslation('equalizer');
  const gradientId = useId();
  const { linePath, areaPath, zeroY } = useEqResponseCurve({
    gains,
    preampDb,
    width: VIEW_W,
    height: VIEW_H,
  });

  const ticks = EQ_BANDS.map(freq => ({ freq, label: formatEqFrequencyTick(freq) }));

  return {
    ariaLabel: t('curvePreview.ariaLabel'),
    gradientId,
    linePath,
    areaPath,
    zeroY,
    disabled,
    ticks,
  };
}
