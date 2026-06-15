import { EQ_MIN_DB, EQ_MAX_DB } from '@/stores/useEqStore';
import type { IVerticalBandSliderProps, IVerticalBandSliderView } from './VerticalBandSlider.types';

const BAND_STEP = 0.5;

export function useVerticalBandSlider(props: IVerticalBandSliderProps): IVerticalBandSliderView {
  const {
    freq,
    value,
    onChange,
    disabled = false,
    label,
    bandName,
    gainLabel,
    heightClass = 'h-56',
  } = props;

  const freqLabel = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;

  return {
    min: EQ_MIN_DB,
    max: EQ_MAX_DB,
    step: BAND_STEP,
    value: [value],
    disabled,
    label,
    bandName,
    gainLabel,
    heightClass,
    freqLabel,
    onValueChange: ([next]) => onChange(next),
  };
}
