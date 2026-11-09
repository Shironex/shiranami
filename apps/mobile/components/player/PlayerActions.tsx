import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Moon from 'lucide-react-native/icons/moon';
import type { IconComponent } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSleepLabel } from '@/hooks/useSleepLabel';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface ActionProps {
  icon: IconComponent;
  label: string;
  on?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}

function Action({ icon: Icon, label, on = false, accessibilityLabel, onPress }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className="h-16 flex-1 items-center justify-center gap-1.5 rounded-xl active:bg-border"
    >
      <Icon size={22} color={on ? colors.primary : colors.softForeground} />
      <Text
        variant="label"
        className={cn('text-[13px]', on ? 'text-primary' : 'text-soft-foreground')}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The sleep timer under the transport, with the time left while it runs. */
export function PlayerActions() {
  const router = useRouter();
  const sleep = useSleepLabel();

  return (
    <View className="flex-row">
      <Action
        icon={Moon}
        label={sleep ?? 'Sleep'}
        on={sleep !== null}
        accessibilityLabel={sleep ? `Sleep timer, ${sleep} left` : 'Sleep timer'}
        onPress={() => router.push('/sleep')}
      />
    </View>
  );
}
