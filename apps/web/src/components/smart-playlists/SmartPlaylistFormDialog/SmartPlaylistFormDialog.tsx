import { Plus, Trash2 } from 'lucide-react';
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
import { FIELD_OPERATORS, valueKindFor } from '@/lib/smart-playlist-fields';
import type { SmartPlaylistField } from '@shiranami/contracts';
import { useSmartPlaylistFormDialog } from './SmartPlaylistFormDialog.hooks';
import type { ISmartPlaylistFormDialogProps } from './SmartPlaylistFormDialog.types';

/**
 * Stand-in for "no explicit sort" in the sort picker. Radix `Select` reserves
 * the empty string to mean "nothing selected", so the absent case needs a real
 * value; it never leaves this component.
 */
const NO_SORT = '__default__';

export default function SmartPlaylistFormDialog(props: ISmartPlaylistFormDialogProps) {
  const {
    t,
    tCommon,
    isEdit,
    name,
    setName,
    matchType,
    setMatchType,
    rules,
    fields,
    limit,
    setLimit,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    isSaving,
    canSave,
    previewCount,
    onFieldChange,
    onOperatorChange,
    onValueChange,
    onValueToChange,
    onAddRule,
    onRemoveRule,
    onSave,
    onCancel,
  } = useSmartPlaylistFormDialog(props);

  const fieldOptions = fields.map(f => (
    <SelectItem key={f} value={f}>
      {t(`fields.${f}`)}
    </SelectItem>
  ));

  const ruleRows = rules.map((rule, index) => {
    const operators = FIELD_OPERATORS[rule.field];
    const kind = valueKindFor(rule.field, rule.operator);
    const operatorOptions = operators.map(op => (
      <SelectItem key={op} value={op}>
        {t(`operators.${op}`)}
      </SelectItem>
    ));

    let valueControl;
    if (kind === 'boolean') {
      valueControl = (
        <Select value={rule.value || 'true'} onValueChange={v => onValueChange(index, v)}>
          <SelectTrigger className="flex-1" aria-label={t('valueLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">{tCommon('yes')}</SelectItem>
            <SelectItem value="false">{tCommon('no')}</SelectItem>
          </SelectContent>
        </Select>
      );
    } else if (kind === 'range') {
      valueControl = (
        <div className="flex flex-1 items-center gap-1">
          <Input
            type="number"
            className="h-8"
            value={rule.value}
            onChange={e => onValueChange(index, e.target.value)}
            placeholder={t('fromPlaceholder')}
            aria-label={t('valueLabel')}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            className="h-8"
            value={rule.valueTo ?? ''}
            onChange={e => onValueToChange(index, e.target.value)}
            placeholder={t('toPlaceholder')}
            aria-label={t('valueToLabel')}
          />
        </div>
      );
    } else {
      const inputType = kind === 'number' || kind === 'days' ? 'number' : 'text';
      const placeholder = kind === 'days' ? t('daysPlaceholder') : t('valuePlaceholder');
      valueControl = (
        <Input
          type={inputType}
          className="h-8 flex-1"
          value={rule.value}
          onChange={e => onValueChange(index, e.target.value)}
          placeholder={placeholder}
          aria-label={t('valueLabel')}
        />
      );
    }

    return (
      <div
        key={index}
        className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/50 p-2"
      >
        <Select
          value={rule.field}
          onValueChange={v => onFieldChange(index, v as (typeof rule)['field'])}
        >
          <SelectTrigger className="w-32" aria-label={t('fieldLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{fieldOptions}</SelectContent>
        </Select>

        <Select
          value={rule.operator}
          onValueChange={v => onOperatorChange(index, v as (typeof rule)['operator'])}
        >
          <SelectTrigger className="w-32" aria-label={t('operatorLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{operatorOptions}</SelectContent>
        </Select>

        {valueControl}

        <IconButton
          size="md"
          onClick={() => onRemoveRule(index)}
          disabled={rules.length === 1}
          aria-label={t('removeRule')}
          title={t('removeRule')}
          className="text-muted-foreground hover:text-destructive [&_svg]:size-4"
        >
          <Trash2 />
        </IconButton>
      </div>
    );
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
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
            <Select value={matchType} onValueChange={v => setMatchType(v as typeof matchType)}>
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
            {ruleRows}
          </div>

          <Button variant="ghost" size="sm" onClick={onAddRule} className="gap-1.5">
            <Plus className="size-4" />
            {t('addRule')}
          </Button>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3 text-xs text-muted-foreground">
            <span>{t('sortPrefix')}</span>
            {/* Radix Select cannot hold an empty string, so the "no explicit
                sort" case travels as a sentinel and is mapped back at the edge. */}
            <Select
              value={sortField === '' ? NO_SORT : sortField}
              onValueChange={v => setSortField(v === NO_SORT ? '' : (v as SmartPlaylistField))}
            >
              <SelectTrigger className="w-36" aria-label={t('sortFieldLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SORT}>{t('sortDefault')}</SelectItem>
                {fieldOptions}
              </SelectContent>
            </Select>

            <Select
              value={sortDirection}
              onValueChange={v => setSortDirection(v as typeof sortDirection)}
              disabled={sortField === ''}
            >
              <SelectTrigger className="w-32" aria-label={t('sortDirectionLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">{t('sortDesc')}</SelectItem>
                <SelectItem value="asc">{t('sortAsc')}</SelectItem>
              </SelectContent>
            </Select>

            <span>{t('limitPrefix')}</span>
            <Input
              type="number"
              min={1}
              className="h-8 w-24"
              value={limit}
              onChange={e => setLimit(e.target.value)}
              placeholder={t('limitPlaceholder')}
              aria-label={t('limitLabel')}
            />
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {t('matchCount', { count: previewCount })}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={onSave} disabled={!canSave}>
            {isEdit ? tCommon('save') : tCommon('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
