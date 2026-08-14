import { Loader2, Pencil, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogHint,
  DialogHintBar,
  DialogTitle,
  DIALOG_ENTER_KEY,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditTagsDialog } from './EditTagsDialog.hooks';
import type { IEditTagsDialogProps } from './EditTagsDialog.types';

export default function EditTagsDialog(props: IEditTagsDialogProps) {
  const { open, onOpenChange } = props;
  const { t, ready, form, saving, textFields, numberFields, setField, handleSave, onClose } =
    useEditTagsDialog(props);

  if (!ready || !form) return null;

  const textInputs = textFields.map(({ key, label }) => (
    <label key={key} className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground/70">{label}</span>
      <Input value={form[key]} onChange={e => setField(key, e.target.value)} disabled={saving} />
    </label>
  ));

  const numberInputs = numberFields.map(({ key, label }) => (
    <label key={key} className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground/70">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        value={form[key]}
        onChange={e => setField(key, e.target.value)}
        disabled={saving}
      />
    </label>
  ));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault();
            if (!saving) handleSave();
          }}
        >
          {textInputs}

          <div className="grid grid-cols-3 gap-3">{numberInputs}</div>

          <p className="text-xs text-muted-foreground">{t('writeWarning')}</p>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              aria-busy={saving}
              className="gap-2 [&_svg]:size-3.5"
            >
              {saving ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        </form>

        <DialogHintBar>
          <DialogHint keyLabel={DIALOG_ENTER_KEY} label={t('save')} />
          <DialogHint keyLabel="Esc" label={t('cancel')} />
        </DialogHintBar>
      </DialogContent>
    </Dialog>
  );
}
