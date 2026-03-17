import { useState, useEffect, useCallback } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    window.electronAPI?.window.isMaximized().then(setIsMaximized);
    const cleanup = window.electronAPI?.window.onMaximizedChange(setIsMaximized);
    return cleanup;
  }, []);

  const handleMinimize = useCallback(() => window.electronAPI?.window.minimize(), []);
  const handleMaximize = useCallback(() => window.electronAPI?.window.maximize(), []);
  const handleClose = useCallback(() => window.electronAPI?.window.close(), []);

  if (IS_MAC) {
    return <div className="drag h-3 shrink-0" />;
  }

  return (
    <div className="drag absolute top-0 right-0 z-[60] flex items-stretch h-8">
      <div className="no-drag flex items-stretch">
        <button
          onClick={handleMinimize}
          className={cn(
            'w-11 flex items-center justify-center',
            'text-muted-foreground/60 hover:bg-accent hover:text-foreground',
            'transition-colors duration-150'
          )}
          aria-label="Minimize"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          onClick={handleMaximize}
          className={cn(
            'w-11 flex items-center justify-center',
            'text-muted-foreground/60 hover:bg-accent hover:text-foreground',
            'transition-colors duration-150'
          )}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Copy className="w-2.5 h-2.5" /> : <Square className="w-2.5 h-2.5" />}
        </button>
        <button
          onClick={handleClose}
          className={cn(
            'w-11 flex items-center justify-center rounded-tr-[10px]',
            'text-muted-foreground/60 hover:bg-red-500/80 hover:text-white',
            'transition-colors duration-150'
          )}
          aria-label="Close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
