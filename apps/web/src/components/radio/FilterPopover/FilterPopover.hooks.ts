import { useMemo, useState } from 'react';
import type { IFilterPopoverProps, IFilterPopoverView } from './FilterPopover.types';

export function useFilterPopover({
  placeholder,
  options,
  value,
  onSelect,
}: IFilterPopoverProps): IFilterPopoverView {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => options.find(o => o.value === value) ?? null, [options, value]);

  const onCommandSelect = (optionValue: string): void => {
    // cmdk lowercases the value passed to onSelect, so resolve case-insensitively.
    const match = options.find(o => o.value.toLowerCase() === optionValue.toLowerCase());
    const next = match?.value ?? null;
    onSelect(next === value ? null : next);
    setOpen(false);
  };

  const triggerLabel = selected
    ? `${selected.prefix ? `${selected.prefix} ` : ''}${selected.label}`
    : placeholder;

  return {
    open,
    setOpen,
    selected,
    triggerLabel,
    onCommandSelect,
  };
}
