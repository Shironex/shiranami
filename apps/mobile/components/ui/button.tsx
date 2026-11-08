import { Pressable, type PressableProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { IconComponent } from './icon';
import { Text } from './text';

const buttonVariants = cva('flex-row items-center justify-center gap-2 rounded-full', {
  variants: {
    variant: {
      primary: 'bg-primary active:opacity-90',
      tonal: 'bg-primary-tonal active:bg-primary-chip',
      text: 'px-3.5 active:bg-border',
    },
    size: {
      default: 'h-12 px-[22px]',
      compact: 'h-11 px-[18px]',
    },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
});

const LABEL_CLASS = {
  primary: 'text-primary-foreground',
  tonal: 'text-foreground',
  text: 'text-primary',
} as const;

const ICON_COLOR = {
  primary: colors.primaryForeground,
  tonal: colors.foreground,
  text: colors.primary,
} as const;

interface ButtonProps
  extends Omit<PressableProps, 'children'>, VariantProps<typeof buttonVariants> {
  label: string;
  icon?: IconComponent;
  /** Fill the icon glyph (play). */
  iconFilled?: boolean;
  className?: string;
}

/** Pill button: primary for the main action, tonal beside it, text for the rest. */
export function Button({
  label,
  icon: Icon,
  iconFilled = false,
  variant = 'primary',
  size,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const tone = variant ?? 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      className={cn(buttonVariants({ variant, size }), disabled && 'opacity-50', className)}
      {...props}
    >
      {Icon && (
        <Icon
          size={20}
          color={ICON_COLOR[tone]}
          fill={iconFilled ? ICON_COLOR[tone] : 'transparent'}
        />
      )}
      <Text variant="button" className={LABEL_CLASS[tone]}>
        {label}
      </Text>
    </Pressable>
  );
}
