import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded-lg text-muted-foreground/75 transition-[background-color,border-color,color,box-shadow,transform] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: '',
        // Window-control style: red wash on hover (used for close buttons).
        destructiveGhost: 'hover:bg-destructive/85 hover:text-destructive-foreground',
      },
      size: {
        sm: 'size-7 [&_svg]:size-3.5',
        md: 'size-8 [&_svg]:size-4',
        lg: 'size-9 [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButtonVariants> {
  asChild?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

function IconButton({
  className,
  variant,
  size,
  asChild = false,
  type,
  ref,
  ...props
}: IconButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(iconButtonVariants({ variant, size, className }))}
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    />
  );
}

export { IconButton, iconButtonVariants };
