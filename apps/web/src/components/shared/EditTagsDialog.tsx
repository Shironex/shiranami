import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { WriteTagsInput } from '@shiranami/contracts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { mapDbTracksToTracks, type DbTrackRecord } from '@/lib/trackMapper';

interface EditTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackId: string;
}

interface FormState {
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  genre: string;
  year: string;
  trackNumber: string;
  discNumber: string;
}

/** Parse a numeric form field. Empty string clears the value (null). */
function parseNumberField(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

export function EditTagsDialog({ open, onOpenChange, trackId }: EditTagsDialogProps) {
  const { t } = useTranslation('editTags');
  const track = useLibraryStore(s => s.library.find(tr => tr.id === trackId));

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed the form from the current track each time the dialog opens.
  useEffect(() => {
    if (!open || !track) return;
    setSaving(false);
    setForm({
      title: track.title ?? '',
      artist: track.artist ?? '',
      albumArtist: track.albumArtist ?? '',
      album: track.album ?? '',
      genre: track.genre ?? '',
      year: track.year != null ? String(track.year) : '',
      trackNumber: track.trackNumber != null ? String(track.trackNumber) : '',
      discNumber: track.discNumber != null ? String(track.discNumber) : '',
    });
  }, [open, track]);

  const setField = useCallback((key: keyof FormState, value: string) => {
    setForm(prev => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleSave = useCallback(async () => {
    if (!form || !track) return;
    setSaving(true);

    const input: WriteTagsInput = {
      id: track.id,
      filePath: track.filePath,
      title: form.title,
      artist: form.artist,
      albumArtist: form.albumArtist,
      album: form.album,
      genre: form.genre,
      year: parseNumberField(form.year),
      trackNumber: parseNumberField(form.trackNumber),
      discNumber: parseNumberField(form.discNumber),
    };

    try {
      const result = await window.electronAPI.metadata.writeTags(input);
      if (!result.success) {
        toast.error(result.error ? t('saveFailedWith', { error: result.error }) : t('saveFailed'));
        setSaving(false);
        return;
      }

      // The handler already wrote the DB row; refresh the library so memoized
      // selectors and album grouping pick up the new tags.
      const allDbTracks = await window.electronAPI.db.tracks.getAll();
      const refreshed = mapDbTracksToTracks(allDbTracks as DbTrackRecord[]);
      useLibraryStore.getState().setLibrary(refreshed);

      toast.success(t('savedToast'));
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t('saveFailedWith', { error: message }));
      setSaving(false);
    }
  }, [form, track, onOpenChange, t]);

  if (!track || !form) return null;

  const textFields: Array<{ key: keyof FormState; label: string }> = [
    { key: 'title', label: t('field.title') },
    { key: 'artist', label: t('field.artist') },
    { key: 'albumArtist', label: t('field.albumArtist') },
    { key: 'album', label: t('field.album') },
    { key: 'genre', label: t('field.genre') },
  ];

  const numberFields: Array<{ key: keyof FormState; label: string }> = [
    { key: 'year', label: t('field.year') },
    { key: 'trackNumber', label: t('field.trackNumber') },
    { key: 'discNumber', label: t('field.discNumber') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault();
            if (!saving) void handleSave();
          }}
        >
          {textFields.map(({ key, label }) => (
            <label key={key} className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground/70">{label}</span>
              <Input
                value={form[key]}
                onChange={e => setField(key, e.target.value)}
                disabled={saving}
              />
            </label>
          ))}

          <div className="grid grid-cols-3 gap-3">
            {numberFields.map(({ key, label }) => (
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
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{t('writeWarning')}</p>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-lg"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              aria-busy={saving}
              className="rounded-lg gap-2 [&_svg]:size-3.5"
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
      </DialogContent>
    </Dialog>
  );
}
