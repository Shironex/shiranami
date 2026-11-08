import { Pressable, ScrollView, type PressableProps } from 'react-native';
import { cn } from '@/lib/utils';
import { Text } from './text';

interface ChipProps extends Omit<PressableProps, 'children'> {
  label: string;
  selected: boolean;
}

/** A filter chip. 36pt tall, with the hit area grown to 44pt. */
export function Chip({ label, selected, ...props }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      className={cn(
        'h-9 justify-center rounded-full border px-4',
        selected ? 'border-primary-ring bg-primary-chip' : 'border-border-strong active:bg-border'
      )}
      {...props}
    >
      <Text
        variant="label"
        className={cn('text-[14px]', selected ? 'text-foreground' : 'text-soft-foreground')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface ChipRowProps<T extends string> {
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
  /** Side padding inside the scroll area, so chips can scroll edge to edge. */
  inset?: number;
}

/** One-line, horizontally scrolling row of single-select chips. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  className,
  inset = 0,
}: ChipRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className={cn('flex-grow-0', className)}
      contentContainerStyle={{ gap: 8, paddingHorizontal: inset, paddingVertical: 4 }}
    >
      {options.map(option => (
        <Chip
          key={option.value}
          label={option.label}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </ScrollView>
  );
}
