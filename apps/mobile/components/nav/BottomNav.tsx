import { Pressable, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LibraryIcon from 'lucide-react-native/icons/library';
import ListMusic from 'lucide-react-native/icons/list-music';
import Radio from 'lucide-react-native/icons/radio';
import Search from 'lucide-react-native/icons/search';
import type { IconComponent } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSettingsContext } from '@/context/SettingsContext';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';

const ICONS: Record<string, IconComponent> = {
  index: LibraryIcon,
  playlists: ListMusic,
  radio: Radio,
  search: Search,
};

/** Material 3 navigation bar: an icon in a pill, with the label under it. */
export function BottomNav({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { settings } = useSettingsContext();

  return (
    <View
      role="tablist"
      className="flex-row bg-nav px-2 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 12) + 4 }}
    >
      {state.routes.map((route, index) => {
        const options = descriptors[route.key].options;
        const label = options.title ?? route.name;
        const Icon = ICONS[route.name] ?? LibraryIcon;
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            role="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            className="min-h-12 flex-1 items-center gap-1"
          >
            <View
              className={cn(
                'h-8 w-16 items-center justify-center rounded-full',
                focused && 'bg-primary-pill'
              )}
            >
              <Icon size={22} color={focused ? colors.foreground : colors.mutedForeground} />
            </View>
            {settings.showLabels && (
              <Text
                variant="caption"
                className={focused ? 'text-foreground' : 'text-muted-foreground'}
              >
                {label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
