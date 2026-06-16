import { useTranslation } from 'react-i18next';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';
import { useWindowControls } from '@/hooks/useWindowControls';
import type { IWindowControlsView } from './WindowControls.types';

export function useWindowControlsView(): IWindowControlsView {
  const { t } = useTranslation('topbar');
  const { isMaximized, minimize, maximize, close } = useWindowControls();

  return {
    t,
    // Windows-only chrome: hidden on macOS (native traffic lights) and in the browser.
    visible: IS_ELECTRON && !IS_MAC,
    isMaximized,
    minimize,
    maximize,
    close,
  };
}
