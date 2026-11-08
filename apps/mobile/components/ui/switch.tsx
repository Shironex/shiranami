import { Pressable, View } from 'react-native';
import { cn } from '@/lib/utils';

interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
}

/** Material 3 style switch in the desktop colors. */
export function Switch({ value, onValueChange, accessibilityLabel }: SwitchProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      hitSlop={6}
      className={cn(
        'h-8 w-[52px] justify-center rounded-full px-1',
        value ? 'items-end bg-primary' : 'items-start bg-switch-track'
      )}
    >
      <View
        className={cn(
          'rounded-full',
          value ? 'h-6 w-6 bg-primary-foreground' : 'ml-0.5 h-5 w-5 bg-muted-foreground'
        )}
      />
    </Pressable>
  );
}
