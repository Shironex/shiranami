import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type {
  SmartPlaylistField,
  SmartPlaylistMatchType,
  SmartPlaylistOperator,
  SmartPlaylistOrderBy,
  SmartPlaylistRule,
  SmartPlaylistSortDirection,
} from '@shiranami/contracts';
import {
  availableFields,
  defaultOperatorFor,
  supportsResultShaping,
} from '@/lib/smart-playlist-fields';
import {
  useCreateSmartPlaylistMutation,
  useSmartPlaylistPreviewQuery,
  useUpdateSmartPlaylistMutation,
  type SmartPlaylistInput,
} from '@/hooks/queries/useSmartPlaylists';
import type {
  ISmartPlaylistFormDialogProps,
  ISmartPlaylistFormDialogView,
} from './SmartPlaylistFormDialog.types';

function emptyRule(): SmartPlaylistRule {
  return { field: 'genre', operator: defaultOperatorFor('genre'), value: '' };
}

export function useSmartPlaylistFormDialog({
  open,
  onOpenChange,
  playlist,
}: ISmartPlaylistFormDialogProps): ISmartPlaylistFormDialogView {
  const { t } = useTranslation('smartPlaylists');
  const { t: tCommon } = useTranslation('common');
  const { t: tToast } = useTranslation('toast');
  const isEdit = !!playlist;

  const [name, setName] = useState('');
  const [matchType, setMatchType] = useState<SmartPlaylistMatchType>('all');
  const [rules, setRules] = useState<SmartPlaylistRule[]>([emptyRule()]);
  // Kept as typed text rather than a number so the input can be emptied — ''
  // is how the editor says "no limit", which `undefined` cannot round-trip
  // through a controlled numeric input.
  const [limit, setLimit] = useState('');
  const [sortField, setSortField] = useState<SmartPlaylistField | ''>('');
  const [sortDirection, setSortDirection] = useState<SmartPlaylistSortDirection>('desc');

  // Both read the running backend, so they are resolved per render rather than
  // frozen at module load — see `availableFields`.
  const fields = availableFields();
  const canShapeResults = supportsResultShaping();

  const createMutation = useCreateSmartPlaylistMutation();
  const updateMutation = useUpdateSmartPlaylistMutation();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Reset the form whenever the dialog (re)opens, seeding from the edited
  // playlist or to a single blank rule for a new one.
  useEffect(() => {
    if (!open) return;
    setName(playlist?.name ?? '');
    setMatchType(playlist?.matchType ?? 'all');
    setRules(playlist?.rules?.length ? playlist.rules.map(r => ({ ...r })) : [emptyRule()]);
    setLimit(playlist?.limit != null ? String(playlist.limit) : '');
    setSortField(playlist?.orderBy?.field ?? '');
    setSortDirection(playlist?.orderBy?.direction ?? 'desc');
  }, [open, playlist]);

  // Both are dropped from the definition when unset, so an untouched form
  // produces exactly the payload it produced before either existed.
  const parsedLimit = useMemo(() => {
    const value = Number(limit);
    return limit.trim() && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
  }, [limit]);

  const orderBy = useMemo<SmartPlaylistOrderBy | undefined>(
    () => (sortField ? { field: sortField, direction: sortDirection } : undefined),
    [sortField, sortDirection]
  );

  const definition = useMemo(
    () => ({ matchType, rules, limit: parsedLimit, orderBy }),
    [matchType, rules, parsedLimit, orderBy]
  );
  const { data: previewTracks } = useSmartPlaylistPreviewQuery(open ? definition : null);

  const updateRule = (index: number, patch: Partial<SmartPlaylistRule>) => {
    setRules(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const onFieldChange = (index: number, field: SmartPlaylistField) => {
    // Reset operator + value when the field changes so the pair stays valid.
    // isFavorite seeds 'true' so an untouched boolean select (which only
    // *displays* "Yes" via `value || 'true'`) actually persists that value
    // rather than an empty string the backend reads as `false`.
    updateRule(index, {
      field,
      operator: defaultOperatorFor(field),
      value: field === 'isFavorite' ? 'true' : '',
      valueTo: undefined,
    });
  };

  const onOperatorChange = (index: number, operator: SmartPlaylistOperator) =>
    updateRule(index, { operator });
  const onValueChange = (index: number, value: string) => updateRule(index, { value });
  const onValueToChange = (index: number, valueTo: string) => updateRule(index, { valueTo });

  const onAddRule = () => setRules(prev => [...prev, emptyRule()]);
  const onRemoveRule = (index: number) =>
    setRules(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const canSave = name.trim().length > 0 && !isSaving;

  const onSave = async () => {
    if (!canSave) return;
    const payload: SmartPlaylistInput = {
      name: name.trim(),
      matchType,
      rules,
      limit: parsedLimit,
      orderBy,
    };
    try {
      if (isEdit && playlist) {
        await updateMutation.mutateAsync({ id: playlist.id, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      // Only dismiss on success — on failure the dialog stays open with the
      // user's input intact so they can retry.
      onOpenChange(false);
    } catch {
      toast.error(tToast(isEdit ? 'failedUpdateSmartPlaylist' : 'failedCreateSmartPlaylist'));
    }
  };

  return {
    t,
    tCommon,
    isEdit,
    name,
    setName,
    matchType,
    setMatchType,
    rules,
    fields,
    canShapeResults,
    limit,
    setLimit,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    isSaving,
    canSave,
    previewCount: previewTracks?.length ?? 0,
    onFieldChange,
    onOperatorChange,
    onValueChange,
    onValueToChange,
    onAddRule,
    onRemoveRule,
    onSave: () => {
      void onSave();
    },
    onCancel: () => onOpenChange(false),
  };
}
