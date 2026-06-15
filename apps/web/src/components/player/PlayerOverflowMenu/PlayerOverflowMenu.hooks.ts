import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { useEqStore } from '@/stores/useEqStore';
import type { IPlayerOverflowMenuView } from './PlayerOverflowMenu.types';

const MOD = navigator.platform.toUpperCase().includes('MAC') ? '⌘' : 'Ctrl';

export function usePlayerOverflowMenu(): IPlayerOverflowMenuView {
  const { t } = useTranslation('player');
  const showVisualizer = useUIStore(s => s.showVisualizer);
  const toggleVisualizer = useUIStore(s => s.toggleVisualizer);
  const setCompactMode = useCompactStore(s => s.setCompactMode);
  const eqEnabled = useEqStore(s => s.enabled);
  const eqPreset = useEqStore(s => s.preset);
  // Mirror the PlayerBar element toggles so a hidden control stays hidden in
  // the narrow-width overflow too. The parent renders this menu only when at
  // least one of the four is visible.
  const showSleepTimer = useInterfaceStore(s => s.playerSleepTimer);
  const showEqualizer = useInterfaceStore(s => s.playerEqualizer);
  const showCompactButton = useInterfaceStore(s => s.playerCompactButton);
  const showVisualizerButton = useInterfaceStore(s => s.playerVisualizerButton);

  const hasActive =
    (showVisualizerButton && showVisualizer) || (showEqualizer && eqEnabled && eqPreset !== 'flat');

  const onEnterCompact = useCallback(() => {
    void setCompactMode(true);
  }, [setCompactMode]);

  return {
    t,
    hasActive,
    showVisualizer,
    showSleepTimer,
    showEqualizer,
    showCompactButton,
    showVisualizerButton,
    compactTooltip: t('compactModeTooltip', { shortcut: `${MOD}+Shift+M` }),
    onEnterCompact,
    onToggleVisualizer: toggleVisualizer,
  };
}
