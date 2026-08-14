import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ListMusic, Play, Shuffle } from 'lucide-react';
import { usePlaylistContextMenu } from './PlaylistContextMenu.hooks';
import type { IPlaylistContextMenuProps } from './PlaylistContextMenu.types';

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="focus-ring w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
    >
      <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/60">
        {icon}
      </span>
      {label}
    </button>
  );
}

export default function PlaylistContextMenu(props: IPlaylistContextMenuProps) {
  const { t, menuRef, adjustedPosition, onOpen, onPlay, onShuffle } = usePlaylistContextMenu(props);

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.12 }}
        className="fixed z-50 min-w-[200px] py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/30"
        style={{
          left: adjustedPosition.x,
          top: adjustedPosition.y,
          transformOrigin: 'top left',
        }}
        onContextMenu={(event: React.MouseEvent) => event.preventDefault()}
      >
        <MenuItem
          icon={<ListMusic className="w-4 h-4" />}
          label={t('openPlaylist')}
          onClick={onOpen}
        />
        <MenuItem icon={<Play className="w-4 h-4" />} label={t('playPlaylist')} onClick={onPlay} />
        <MenuItem
          icon={<Shuffle className="w-4 h-4" />}
          label={t('shufflePlaylist')}
          onClick={onShuffle}
        />
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
