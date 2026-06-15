import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { useLayoutStore, type VisualizerPosition } from '@/stores/useLayoutStore';
import type { IVisualizerSectionView } from './VisualizerSection.types';

export function useVisualizerSection(): IVisualizerSectionView {
  const { t } = useTranslation('settings');
  const visualizerStyle = useUIStore(s => s.visualizerStyle);
  const setVisualizerStyle = useUIStore(s => s.setVisualizerStyle);
  const showVisualizer = useUIStore(s => s.showVisualizer);
  const toggleVisualizer = useUIStore(s => s.toggleVisualizer);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const visualizerPosition = useLayoutStore(s => s.visualizerPosition);
  const setVisualizerPosition = useLayoutStore(s => s.setVisualizerPosition);

  return {
    title: t('vis.title'),
    subtitle: t('vis.subtitle'),

    showLabel: t('vis.show'),
    showDescription: t('vis.showDesc'),
    showVisualizer,
    onToggleVisualizer: () => toggleVisualizer(),

    positionLabel: t('vis.position'),
    positionDescription: lowPerformanceMode ? t('vis.positionDescLowPerf') : t('vis.positionDesc'),
    visualizerPosition,
    positionDisabled: lowPerformanceMode,
    positionOptions: [
      { value: 'top', label: t('vis.positionTop') },
      { value: 'bottom', label: t('vis.positionBottom') },
    ],
    onPositionChange: value => setVisualizerPosition(value as VisualizerPosition),

    styleLabel: t('vis.style'),
    visualizerStyle,
    onStyleChange: setVisualizerStyle,
  };
}
