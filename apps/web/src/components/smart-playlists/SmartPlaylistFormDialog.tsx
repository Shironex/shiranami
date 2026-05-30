import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type {
  SmartPlaylist,
  SmartPlaylistField,
  SmartPlaylistMatchType,
  SmartPlaylistOperator,
  SmartPlaylistRule,
} from '@shiranami/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import {
  defaultOperatorFor,
  FIELD_OPERATORS,
  SMART_PLAYLIST_FIELDS,
  valueKindFor,
} from '@/lib/smart-playlist-fields';
import {
  useCreateSmartPlaylistMutation,
  useSmartPlaylistPreviewQuery,
  useUpdateSmartPlaylistMutation,
  type SmartPlaylistInput,
} from '@/hooks/queries/useSmartPlaylists';

interface SmartPlaylistFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing playlist to edit, or null/undefined to create a new one. */
  playlist?: SmartPlaylist | null;
}

function emptyRule(): SmartPlaylistRule {
  return { field: 'genre', operator: defaultOperatorFor('genre'), value: '' };
}

export function SmartPlaylistFormDialog({
  open,
  onOpenChange,
  playlist,
}: SmartPlaylistFormDialogProps) {
  const { t } = useTranslation('smartPlaylists');
  const { t: tCommon } = useTranslation('common');
  const isEdit = !!playlist;

  const [name, setName] = useState('');
  const [matchType, setMatchType] = useState<SmartPlaylistMatchType>('all');
  const [rules, setRules] = useState<SmartPlaylistRule[]>([emptyRule()]);

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
  }, [open, playlist]);

  const definition = useMemo(() => ({ matchType, rules }), [matchType, rules]);
  const { data: previewTracks } = useSmartPlaylistPreviewQuery(open ? definition : null);

  const updateRule = (index: number, patch: Partial<SmartPlaylistRule>) => {
    setRules(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const handleFieldChange = (index: number, field: SmartPlaylistField) => {
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

  const addRule = () => setRules(prev => [...prev, emptyRule()]);
  const removeRule = (index: number) =>
    setRules(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const canSave = name.trim().length > 0 && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    const payload: SmartPlaylistInput = { name: name.trim(), matchType, rules };
    if (isEdit && playlist) {
      await updateMutation.mutateAsync({ id: playlist.id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editTitle') : t('createTitle')}</DialogTitle>
          <DialogDescription>{t('formDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="smart-playlist-name" className="text-xs font-medium text-foreground">
              {t('nameLabel')}
            </label>
            <Input
              id="smart-playlist-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t('matchPrefix')}</span>
            <Select
              value={matchType}
              onValueChange={v => setMatchType(v as SmartPlaylistMatchType)}
            >
              <SelectTrigger aria-label={t('matchTypeLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('matchAll')}</SelectItem>
                <SelectItem value="any">{t('matchAny')}</SelectItem>
              </SelectContent>
            </Select>
            <span>{t('matchSuffix')}</span>
          </div>

          <div className="space-y-2 max-h-[40vh] overflow-y-auto scrollbar-thin pr-1">
            {rules.map((rule, index) => {
              const operators = FIELD_OPERATORS[rule.field];
              const kind = valueKindFor(rule.field, rule.operator);
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/50 p-2"
                >
                  <Select
                    value={rule.field}
                    onValueChange={v => handleFieldChange(index, v as SmartPlaylistField)}
                  >
                    <SelectTrigger className="w-32" aria-label={t('fieldLabel')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SMART_PLAYLIST_FIELDS.map(f => (
                        <SelectItem key={f} value={f}>
                          {t(`fields.${f}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={rule.operator}
                    onValueChange={v => updateRule(index, { operator: v as SmartPlaylistOperator })}
                  >
                    <SelectTrigger className="w-32" aria-label={t('operatorLabel')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operators.map(op => (
                        <SelectItem key={op} value={op}>
                          {t(`operators.${op}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {kind === 'boolean' ? (
                    <Select
                      value={rule.value || 'true'}
                      onValueChange={v => updateRule(index, { value: v })}
                    >
                      <SelectTrigger className="flex-1" aria-label={t('valueLabel')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">{tCommon('yes')}</SelectItem>
                        <SelectItem value="false">{tCommon('no')}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : kind === 'range' ? (
                    <div className="flex flex-1 items-center gap-1">
                      <Input
                        type="number"
                        className="h-8"
                        value={rule.value}
                        onChange={e => updateRule(index, { value: e.target.value })}
                        placeholder={t('fromPlaceholder')}
                        aria-label={t('valueLabel')}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="number"
                        className="h-8"
                        value={rule.valueTo ?? ''}
                        onChange={e => updateRule(index, { valueTo: e.target.value })}
                        placeholder={t('toPlaceholder')}
                        aria-label={t('valueToLabel')}
                      />
                    </div>
                  ) : (
                    <Input
                      type={kind === 'number' || kind === 'days' ? 'number' : 'text'}
                      className="h-8 flex-1"
                      value={rule.value}
                      onChange={e => updateRule(index, { value: e.target.value })}
                      placeholder={kind === 'days' ? t('daysPlaceholder') : t('valuePlaceholder')}
                      aria-label={t('valueLabel')}
                    />
                  )}

                  <IconButton
                    size="md"
                    onClick={() => removeRule(index)}
                    disabled={rules.length === 1}
                    aria-label={t('removeRule')}
                    title={t('removeRule')}
                    className="text-muted-foreground hover:text-destructive [&_svg]:size-4"
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              );
            })}
          </div>

          <Button variant="ghost" size="sm" onClick={addRule} className="gap-1.5">
            <Plus className="size-4" />
            {t('addRule')}
          </Button>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {t('matchCount', { count: previewTracks?.length ?? 0 })}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEdit ? tCommon('save') : tCommon('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
