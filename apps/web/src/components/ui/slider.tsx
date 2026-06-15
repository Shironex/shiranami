import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

function Slider({
  className,
  ref,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
  ...props
}: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  ref?: React.Ref<React.ComponentRef<typeof SliderPrimitive.Root>>;
}) {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex w-full touch-none select-none items-center group cursor-pointer py-1',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-foreground/[0.06] group-hover:h-[5px] transition-all duration-200">
        <SliderPrimitive.Range className="absolute h-full bg-primary/80 group-hover:bg-primary rounded-full transition-colors duration-200" />
      </SliderPrimitive.Track>
      {/* The accessible name + description must land on the `role="slider"`
          element — Radix puts that role on the Thumb, not the Root. Forwarding
          them here (instead of letting them sit on the unlabelled Root span)
          keeps axe's aria-input-field-name rule satisfied for every labelled
          slider, and lets screen readers announce any associated description. */}
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        className="block h-0 w-0 group-hover:h-3 group-hover:w-3 focus-visible:h-3 focus-visible:w-3 rounded-full bg-primary shadow-md shadow-primary/30 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
