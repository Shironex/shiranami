import { Pressable, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import ListPlus from 'lucide-react-native/icons/list-plus';
import Moon from 'lucide-react-native/icons/moon';
import Share2 from 'lucide-react-native/icons/share-2';
import type { IconComponent } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSleepLabel } from '@/hooks/useSleepLabel';
import { UNKNOWN_ARTIST } from '@/lib/track-meta';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { Track } from '@/stores/usePlayerStore';

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
      hitSlop={{ top: 6, bottom: 6 }}
      className={cn(
        'h-[34px] flex-row items-center gap-1.5 rounded-full px-3 active:bg-border active:opacity-80',
        on && 'bg-primary-tint'
      )}
    >
      <Icon size={17} color={on ? colors.primary : colors.mutedForeground} />
      <Text
        variant="label"
        className={cn('text-[13px]', on ? 'text-primary' : 'text-muted-foreground')}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** "Title by Artist" for the share sheet. */
export function shareText(track: Track): string {
  return track.artist && track.artist !== UNKNOWN_ARTIST
    ? `${track.title} by ${track.artist}`
    : track.title;
}

/**
 * A quiet row of actions above the seek bar: add the song to a playlist,
 * share it, and the sleep timer (with the time left while it runs). Radio
 * has no playlist entry, so it gets share and sleep only.
 */
export function PlayerActions({ track }: { track: Track }) {
  const router = useRouter();
  const sleep = useSleepLabel();
  const live = !!track.isLive;

  return (
    <View className="flex-row items-center justify-center gap-2">
      {!live && (
        <Action
          icon={ListPlus}
          label="Add to playlist"
          onPress={() =>
            router.push({ pathname: '/add-to-playlist', params: { trackId: track.id } })
          }
        />
      )}
      <Action
        icon={Share2}
        label="Share"
        accessibilityLabel={`Share ${track.title}`}
        onPress={() => void Share.share({ message: shareText(track) }).catch(() => {})}
      />
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
