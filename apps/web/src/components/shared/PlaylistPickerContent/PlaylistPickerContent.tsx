import { ListPlus, Check, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlaylistPickerContent } from './PlaylistPickerContent.hooks';
import type { IPlaylistPickerContentProps } from './PlaylistPickerContent.types';

export default function PlaylistPickerContent(props: IPlaylistPickerContentProps) {
  const {
    tCommon,
    isLoading,
    playlists,
    isMember,
    isMutating,
    onToggle,
    showNewForm,
    onShowNewForm,
    onCancelNewForm,
    newName,
    onNewNameChange,
    onCreateAndAdd,
  } = usePlaylistPickerContent(props);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-3">
        <Loader2 className="w-4 h-4 text-muted-foreground/40 animate-spin" />
      </div>
    );
  }

  const showEmpty = playlists.length === 0 && !showNewForm;

  const playlistRows = playlists.map(pl => {
    const isInPlaylist = isMember(pl.id);
    return (
      <button
        key={pl.id}
        onClick={e => {
          e.stopPropagation();
          onToggle(pl);
        }}
        disabled={isMutating}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left disabled:pointer-events-none ${
          isInPlaylist
            ? 'text-primary/80 hover:text-primary hover:bg-accent'
            : 'text-foreground/80 hover:text-foreground hover:bg-accent'
        }`}
      >
        {isInPlaylist ? (
          <Check className="w-3 h-3 text-primary shrink-0" />
        ) : (
          <ListPlus className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        )}
        <span className="truncate">{pl.name}</span>
      </button>
    );
  });

  return (
    <>
      <div className="max-h-40 overflow-y-auto scrollbar-thin">
        {showEmpty && (
          <p className="px-3 py-2 text-xs text-muted-foreground/50">{tCommon('noPlaylists')}</p>
        )}
        {playlistRows}
      </div>
      <div className="border-t border-border/30 mt-1 pt-1">
        {showNewForm ? (
          <div className="px-2 py-1 flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={e => onNewNameChange(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') onCreateAndAdd();
                if (e.key === 'Escape') onCancelNewForm();
              }}
              onClick={e => e.stopPropagation()}
              placeholder={tCommon('namePlaceholder')}
              aria-label={tCommon('namePlaceholder')}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/30 outline-none min-w-0"
            />
            <Button
              size="sm"
              onClick={e => {
                e.stopPropagation();
                onCreateAndAdd();
              }}
              disabled={!newName.trim() || isMutating}
              className="h-auto rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary shadow-none hover:bg-primary/30"
            >
              {tCommon('add')}
            </Button>
          </div>
        ) : (
          <button
            onClick={e => {
              e.stopPropagation();
              onShowNewForm();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-primary/80 hover:text-primary hover:bg-accent transition-colors"
          >
            <Plus className="w-3 h-3" />
            {tCommon('newPlaylist')}
          </button>
        )}
      </div>
    </>
  );
}
