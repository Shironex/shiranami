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
import { useFilterPopover } from './FilterPopover.hooks';
import type { IFilterPopoverProps } from './FilterPopover.types';

function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  return String(count);
}

export default function FilterPopover(props: IFilterPopoverProps) {
  const { label, searchPlaceholder, emptyText, options, value, icon, disabled } = props;
  const { open, setOpen, selected, triggerLabel, onCommandSelect } = useFilterPopover(props);

  // Build the option rows above the return so the JSX child stays declarative
  // (no `.map`/arithmetic in render position). Only map when the popover is open —
  // radix unmounts the content while closed, so mapping (potentially hundreds of
  // options) on every render would be wasted work.
  const optionItems = open
    ? options.map(option => {
        const countLabel = typeof option.count === 'number' ? formatCount(option.count) : null;
        return (
          <CommandItem
            key={option.value}
            value={option.value}
            keywords={[option.label]}
            onSelect={onCommandSelect}
            className="justify-between gap-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              {option.prefix && <span className="shrink-0">{option.prefix}</span>}
              <span className="truncate">{option.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {countLabel && (
                <span className="text-[10px] tabular-nums text-muted-foreground/50">
                  {countLabel}
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
        );
      })
    : null;

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
            <CommandGroup>{optionItems}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
