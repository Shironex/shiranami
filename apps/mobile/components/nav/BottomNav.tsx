import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { BottomTabBarProps } from 'expo-router/tabs';
import LibraryIcon from 'lucide-react-native/icons/library';
import ListMusic from 'lucide-react-native/icons/list-music';
import Radio from 'lucide-react-native/icons/radio';
import Search from 'lucide-react-native/icons/search';
import type { IconComponent } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSettingsContext } from '@/context/SettingsContext';
import { DOCK_TAB_INSET, dockSliderX, dockTabWidth } from '@/lib/dock';
import { EASE_OUT_QUART, colors } from '@/lib/theme';
import { cn } from '@/lib/utils';

const ICONS: Record<string, IconComponent> = {
  index: LibraryIcon,
  '(library)': LibraryIcon,
  playlists: ListMusic,
  radio: Radio,
  search: Search,
};

const SLIDE = { duration: 220, easing: Easing.bezier(...EASE_OUT_QUART) };

/**
 * The tab row of the dock. The selected tab sits in a raised squircle that
 * slides between tabs; the label turns semibold without moving.
 */
export function BottomNav({ state, descriptors, navigation }: BottomTabBarProps) {
  const { settings } = useSettingsContext();
  const [width, setWidth] = useState(0);
  const count = state.routes.length;
  const x = useSharedValue(0);
  const placed = useSharedValue(false);

  useEffect(() => {
    if (width === 0) return;
    const target = dockSliderX(state.index, width, count);
    // The first placement jumps; later ones slide.
    x.value = placed.value ? withTiming(target, SLIDE) : target;
    placed.value = true;
  }, [state.index, width, count, x, placed]);

  const sliderStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      role="tablist"
      className={cn('flex-row', settings.showLabels ? 'h-16' : 'h-14')}
      style={{ padding: DOCK_TAB_INSET }}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.slider, { width: dockTabWidth(width, count) }, sliderStyle]}
        />
      )}
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
            className="flex-1 items-center justify-center gap-[3px] rounded-[18px]"
          >
            <Icon size={22} color={focused ? colors.dockIcon : colors.mutedForeground} />
            {settings.showLabels && (
              <Text
                variant="caption"
                className={focused ? 'font-body-semibold text-foreground' : 'text-muted-foreground'}
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

// Reanimated views take no className (NativeWind only maps core components).
const styles = StyleSheet.create({
  slider: {
    position: 'absolute',
    top: DOCK_TAB_INSET,
    bottom: DOCK_TAB_INSET,
    left: DOCK_TAB_INSET,
    borderRadius: 18,
    borderWidth: 1,
    // Primary at 22%, quieter than the ring on chips.
    borderColor: `${colors.primary}38`,
    backgroundColor: colors.dockTab,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 0 6px 14px -8px rgba(0,0,4,0.9)',
  },
});
