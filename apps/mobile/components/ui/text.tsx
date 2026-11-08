import { cn } from '@/lib/utils';
import * as Slot from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Platform, Text as RNText, type Role } from 'react-native';

/**
 * Type scale from the Window design. Sora carries titles, DM Sans everything
 * else. Weights come from the font family (see theme/fonts.js), so no variant
 * sets `font-weight`. Letter spacing is in px: React Native has no `em`.
 */
const textVariants = cva(cn('text-foreground', Platform.select({ web: 'select-text' })), {
  variants: {
    variant: {
      default: 'font-body text-base',
      display: 'font-display text-[28px] leading-[31px] tracking-[-0.56px]',
      title: 'font-display text-[24px] leading-[29px] tracking-[-0.36px]',
      heading: 'font-display text-[22px] leading-[27px] tracking-[-0.33px]',
      sheetTitle: 'font-display text-[20px] leading-[24px] tracking-[-0.2px]',
      body: 'font-body text-[15.5px] leading-[23px]',
      bodyMuted: 'font-body text-[15.5px] leading-[23px] text-muted-foreground',
      rowTitle: 'font-body-medium text-[15.5px] leading-[20px]',
      meta: 'font-body text-[13.5px] leading-[18px] text-muted-foreground',
      label: 'font-body-medium text-[14px] leading-[18px] text-muted-foreground',
      option: 'font-body text-[16px] leading-[21px]',
      button: 'font-body-semibold text-[15px] leading-[18px]',
      caption: 'font-body-medium text-[12.5px] leading-[16px]',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type TextVariantProps = VariantProps<typeof textVariants>;
type TextVariant = NonNullable<TextVariantProps['variant']>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  display: 'heading',
  title: 'heading',
  heading: 'heading',
  sheetTitle: 'heading',
};

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof RNText> &
  TextVariantProps &
  React.RefAttributes<RNText> & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn(textVariants({ variant }), textClass, className)}
      role={variant ? ROLE[variant] : undefined}
      {...props}
    />
  );
}

export { Text, TextClassContext };
