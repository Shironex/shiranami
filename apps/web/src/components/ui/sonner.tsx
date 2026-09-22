import { Toaster as Sonner } from 'sonner';
import { PLAYER_BAR_HEIGHT } from '@/lib/layout';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * App toast surface. Colors, radius and close-button chrome come entirely from
 * the app's theme tokens (see the [data-sonner-toaster] block in globals.css),
 * so toasts follow the active app theme rather than one of sonner's built-in
 * palettes — no hardcoded theme prop. Bottom-right, lifted above the player
 * bar so a toast never covers the transport controls.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      offset={{ bottom: PLAYER_BAR_HEIGHT + 12 }}
      duration={4000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
