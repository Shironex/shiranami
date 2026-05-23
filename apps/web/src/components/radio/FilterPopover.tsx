import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export interface FilterOption {
  /** API filter value (ISO-2 code for countries, language/tag name otherwise). */
  value: string;
  /** Human-readable label shown in the list and used for type-ahead matching. */
  label: string;
  /** Optional leading glyph (e.g. a country flag emoji). */
  prefix?: string;
  /** radio-browser station count for this option. */
  count?: number;
}

interface FilterPopoverProps {
  /** Visible field label, e.g. "Country". */
  label: string;
  /** Label shown on the trigger when nothing is selected, e.g. "All countries". */
  placeholder: string;
  /** Type-ahead input placeholder. */
  searchPlaceholder: string;
  /** Empty-results message. */
  emptyText: string;
  options: FilterOption[];
  /** Currently selected value, or null when cleared. */
  value: string | null;
  onSelect: (value: string | null) => void;
  /** Optional leading icon for the trigger. */
  icon?: React.ReactNode;
  disabled?: boolean;
}

function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  return String(count);
}

export function FilterPopover({
  label,
  placeholder,
  searchPlaceholder,
  emptyText,
  options,
  value,
  onSelect,
  icon,
  disabled,
}: FilterPopoverProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => options.find(o => o.value === value) ?? null, [options, value]);

  const handleSelect = (optionValue: string) => {
    // cmdk lowercases the value passed to onSelect, so resolve case-insensitively.
    const match = options.find(o => o.value.toLowerCase() === optionValue.toLowerCase());
    const next = match?.value ?? null;
    onSelect(next === value ? null : next);
    setOpen(false);
  };

  const triggerLabel = selected
    ? `${selected.prefix ? `${selected.prefix} ` : ''}${selected.label}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={label}
        className={cn(
          'inline-flex h-8 max-w-[14rem] items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
          'disabled:pointer-events-none disabled:opacity-50',
          selected
            ? 'bg-primary/15 text-primary'
            : 'glass-subtle border border-border/40 text-muted-foreground hover:text-foreground'
        )}
      >
        {icon}
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map(option => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label]}
                  onSelect={handleSelect}
                  className="justify-between gap-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {option.prefix && <span className="shrink-0">{option.prefix}</span>}
                    <span className="truncate">{option.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {typeof option.count === 'number' && (
                      <span className="text-[10px] tabular-nums text-muted-foreground/50">
                        {formatCount(option.count)}
                      </span>
                    )}
                    <Check
                      className={cn(
                        'h-3.5 w-3.5 text-primary',
                        option.value === value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
