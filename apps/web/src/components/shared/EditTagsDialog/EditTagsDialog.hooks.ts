import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { WriteTagsInput } from '@shiranami/contracts';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { mapDbTrackToTrack } from '@/lib/trackMapper';
import type {
  IEditTagsDialogProps,
  IEditTagsDialogView,
  IEditTagsField,
  IEditTagsFormState,
} from './EditTagsDialog.types';

/** Parse a numeric form field. Empty string clears the value (null). */
function parseNumberField(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

export function useEditTagsDialog({
  open,
  onOpenChange,
  trackId,
}: IEditTagsDialogProps): IEditTagsDialogView {
  const { t } = useTranslation('editTags');
  const track = useLibraryStore(s => s.library.find(tr => tr.id === trackId));

  const [form, setForm] = useState<IEditTagsFormState | null>(null);
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

  const setField = useCallback((key: keyof IEditTagsFormState, value: string) => {
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

      // The handler already wrote the DB row. Rather than refetching the entire
      // library (an O(n) re-map that lags as the library grows past 10k tracks),
      // patch just the edited track in the local store. We route the written
      // values back through the same mapper used for DB loads so field
      // normalization (artist/albumArtist fallbacks, etc.) stays the single
      // source of truth, then hand only the tag fields to `updateTrackTags` —
      // omitting isFavorite/playCount so the session overlay still merges on top.
      const normalized = mapDbTrackToTrack({
        ...track,
        title: form.title,
        artist: form.artist,
        albumArtist: form.albumArtist,
        album: form.album,
        genre: form.genre,
        year: input.year,
        trackNumber: input.trackNumber,
        discNumber: input.discNumber,
      });
      useLibraryStore.getState().updateTrackTags(track.id, {
        title: normalized.title,
        artist: normalized.artist,
        albumArtist: normalized.albumArtist,
        album: normalized.album,
        genre: normalized.genre,
        year: normalized.year,
        trackNumber: normalized.trackNumber,
        discNumber: normalized.discNumber,
      });

      toast.success(t('savedToast'));
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t('saveFailedWith', { error: message }));
      setSaving(false);
    }
  }, [form, track, onOpenChange, t]);

  const textFields: IEditTagsField[] = [
    { key: 'title', label: t('field.title') },
    { key: 'artist', label: t('field.artist') },
    { key: 'albumArtist', label: t('field.albumArtist') },
    { key: 'album', label: t('field.album') },
    { key: 'genre', label: t('field.genre') },
  ];

  const numberFields: IEditTagsField[] = [
    { key: 'year', label: t('field.year') },
    { key: 'trackNumber', label: t('field.trackNumber') },
    { key: 'discNumber', label: t('field.discNumber') },
  ];

  return {
    t,
    ready: Boolean(track && form),
    form,
    saving,
    textFields,
    numberFields,
    setField,
    handleSave: () => {
      void handleSave();
    },
    onClose: () => onOpenChange(false),
  };
}
