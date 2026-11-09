import { View } from 'react-native';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import type { IconComponent } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

export type PullStatus = 'waiting' | 'active' | 'done';

interface PullItemProps {
  icon: IconComponent;
  label: string;
  hint: string;
  status: PullStatus;
  /** 0 to 1, shown as a bar while active. */
  ratio?: number;
}

/** One line of the first pull: favorites, playlists, library, covers. */
export function PullItem({ icon: Icon, label, hint, status, ratio }: PullItemProps) {
  const percent = ratio != null ? Math.round(Math.min(1, Math.max(0, ratio)) * 100) : null;
  return (
    <View className="flex-row items-center gap-4 px-6 py-3">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary-tonal">
        <Icon size={20} color={colors.foreground} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="option">{label}</Text>
        <Text variant="meta" className="mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>
          {hint}
        </Text>
        {status === 'active' && percent != null && (
          <View
            className="mt-2 h-1 overflow-hidden rounded-full bg-border"
            accessibilityRole="progressbar"
            accessibilityLabel={label}
            accessibilityValue={{ min: 0, max: 100, now: percent }}
          >
            <View className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </View>
        )}
      </View>
      {status === 'done' && (
        <View accessibilityLabel="Done">
          <CircleCheck size={22} color={colors.primary} />
        </View>
      )}
      {status === 'active' && percent != null && (
        <Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>
          {`${percent}%`}
        </Text>
      )}
      {status === 'waiting' && <Text variant="meta">Waiting</Text>}
    </View>
  );
}
