import { Pressable, type PressableProps } from 'react-native';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { IconComponent } from './icon';

interface IconButtonProps extends Omit<PressableProps, 'children'> {
  icon: IconComponent;
  /** Read by screen readers; icon buttons have no visible text. */
  accessibilityLabel: string;
  color?: string;
  size?: number;
  /** Solid glyphs (play, pause, skip) fill with the stroke color. */
  filled?: boolean;
  className?: string;
}

/** A 44pt round hit area around one icon. */
export function IconButton({
  icon: Icon,
  color = colors.softForeground,
  size = 22,
  filled = false,
  className,
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        'h-11 w-11 items-center justify-center rounded-full active:bg-border',
        className
      )}
      {...props}
    >
      <Icon
        size={size}
        color={color}
        fill={filled ? color : 'transparent'}
        strokeWidth={filled ? 1.5 : 2}
      />
    </Pressable>
  );
}
