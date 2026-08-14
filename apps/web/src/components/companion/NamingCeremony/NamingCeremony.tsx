import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Companion } from '@/components/companion/Companion';
import { COMPANION_NAME_MAX_LENGTH } from '@/hooks/useCompanionPresence';
import { useNamingCeremony } from './NamingCeremony.hooks';

/**
 * The naming ceremony — a one-time cozy moment when the companion reaches its
 * first evolution (or on first enable if it hatched past it) and is still
 * nameless. One small dialog, one input, no pressure: "maybe later" passes
 * the moment forever and leaves the rename affordance in Settings.
 */
export default function NamingCeremony() {
  const {
    t,
    open,
    species,
    stage,
    motion,
    fallbackName,
    draft,
    onDraftChange,
    canConfirm,
    onConfirm,
    onLater,
  } = useNamingCeremony();

  if (!open) return null;

  return (
    <Dialog
      open
      onOpenChange={isOpen => {
        if (!isOpen) onLater();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm" data-slot="naming-ceremony">
        <DialogHeader className="items-center text-center">
          <Companion species={species} stage={stage} mode="listening" motion={motion} size={72} />
          <DialogTitle className="mt-2">{t('naming.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground text-center leading-relaxed">
          {t('naming.line')}
        </p>
        <form
          onSubmit={event => {
            event.preventDefault();
            if (canConfirm) onConfirm();
          }}
          className="flex flex-col gap-3"
        >
          <Input
            value={draft}
            onChange={event => onDraftChange(event.target.value)}
            placeholder={t('naming.placeholder', { fallback: fallbackName })}
            aria-label={t('naming.inputLabel')}
            maxLength={COMPANION_NAME_MAX_LENGTH}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onLater}>
              {t('naming.later')}
            </Button>
            <Button type="submit" size="sm" disabled={!canConfirm}>
              {t('naming.confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
