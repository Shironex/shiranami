import { memo, useCallback, useEffect, useState } from 'react';
import { type LayoutChangeEvent, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Library, Radio, Search, Settings } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useSettingsContext } from '@/context/SettingsContext';
import { colors } from '@/lib/theme';

const PILL_COLOR = colors.primary;
const ACTIVE_COLOR = colors.foreground;
const INACTIVE_COLOR = colors.mutedForeground;
const ICON_SIZE = 22;

function IconCrossfade({
  active,
  children,
}: {
  active: boolean;
  children: (color: string) => React.ReactNode;
}) {
  const activeOpacity = useSharedValue(active ? 1 : 0);
  const inactiveOpacity = useSharedValue(active ? 0 : 1);

  useEffect(() => {
    activeOpacity.value = withTiming(active ? 1 : 0, { duration: 250 });
    inactiveOpacity.value = withTiming(active ? 0 : 1, { duration: 250 });
  }, [active, activeOpacity, inactiveOpacity]);

  const activeStyle = useAnimatedStyle(() => ({ opacity: activeOpacity.value }));
  const inactiveStyle = useAnimatedStyle(() => ({ opacity: inactiveOpacity.value }));

  return (
    <View>
      <Animated.View style={inactiveStyle}>{children(INACTIVE_COLOR)}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, activeStyle]}>
        {children(ACTIVE_COLOR)}
      </Animated.View>
    </View>
  );
}

function LibraryIcon({ active }: { active: boolean }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withSpring(1, { damping: 15 });
    }
  }, [active, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <IconCrossfade active={active}>
        {color => <Library size={ICON_SIZE} color={color} />}
      </IconCrossfade>
    </Animated.View>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (active) {
      translateY.value = withRepeat(
        withSequence(
          withTiming(-2, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      translateY.value = withSpring(0, { damping: 15 });
    }
  }, [active, translateY]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={style}>
      <IconCrossfade active={active}>
        {color => <Search size={ICON_SIZE} color={color} />}
      </IconCrossfade>
    </Animated.View>
  );
}

function RadioIcon({ active }: { active: boolean }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.96, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withSpring(1, { damping: 15 });
    }
  }, [active, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <IconCrossfade active={active}>
        {color => <Radio size={ICON_SIZE} color={color} />}
      </IconCrossfade>
    </Animated.View>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (active) {
      rotation.value = withRepeat(
        withSequence(
          withTiming(-4, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(4, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      rotation.value = withSpring(0, { damping: 15 });
    }
  }, [active, rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <IconCrossfade active={active}>
        {color => <Settings size={ICON_SIZE} color={color} />}
      </IconCrossfade>
    </Animated.View>
  );
}

const TAB_ICONS: Record<string, React.FC<{ active: boolean }>> = {
  index: LibraryIcon,
  search: SearchIcon,
  radio: RadioIcon,
  settings: SettingsIcon,
};

const TabItem = memo(function TabItem({
  label,
  routeName,
  active,
  showLabel,
  onPress,
  onLongPress,
}: {
  label: string;
  routeName: string;
  active: boolean;
  showLabel: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const pressScale = useSharedValue(1);
  const labelOpacity = useSharedValue(showLabel ? 1 : 0);
  const labelHeight = useSharedValue(showLabel ? 14 : 0);

  useEffect(() => {
    labelOpacity.value = withTiming(showLabel ? 1 : 0, { duration: 200 });
    labelHeight.value = withTiming(showLabel ? 14 : 0, { duration: 200 });
  }, [showLabel, labelOpacity, labelHeight]);

  const labelAnimStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    height: labelHeight.value,
    overflow: 'hidden' as const,
  }));

  const handlePressIn = useCallback(() => {
    pressScale.value = withSpring(0.85, { damping: 15, stiffness: 300 });
  }, [pressScale]);

  const handlePressOut = useCallback(() => {
    pressScale.value = withSpring(1, { damping: 8, stiffness: 200 });
  }, [pressScale]);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const IconComponent = TAB_ICONS[routeName];

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={s.tabItem}
    >
      <Animated.View style={[s.tabItemInner, scaleStyle]}>
        {IconComponent && <IconComponent active={active} />}
        <Animated.View style={labelAnimStyle}>
          <Text style={[s.label, active && s.labelActive]} numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

function SlidingPill({ activeIndex, tabWidth }: { activeIndex: number; tabWidth: number }) {
  const translateX = useSharedValue(activeIndex * tabWidth);
  const glowOpacity = useSharedValue(0.4);

  useEffect(() => {
    translateX.value = withSpring(activeIndex * tabWidth, {
      damping: 18,
      stiffness: 160,
      mass: 0.6,
    });
  }, [activeIndex, tabWidth, translateX]);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [glowOpacity]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const pillWidth = tabWidth * 0.65;
  const pillOffset = (tabWidth - pillWidth) / 2;

  return (
    <Animated.View style={[s.pillContainer, { width: tabWidth }, pillStyle]} pointerEvents="none">
      <Animated.View
        style={[s.pillGlow, { width: pillWidth + 8, left: pillOffset - 4 }, glowStyle]}
      />
      <View style={[s.pill, { width: pillWidth, left: pillOffset }]} />
    </Animated.View>
  );
}

function AnimatedTabBarInner({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { settings } = useSettingsContext();
  const showLabels = settings.showLabels;
  const tabCount = state.routes.length;
  const [barWidth, setBarWidth] = useState(0);
  const tabWidth = barWidth / tabCount;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
  }, []);

  return (
    <View style={[s.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={s.bar} onLayout={handleLayout}>
        <View style={s.topHighlight} />

        {tabWidth > 0 && (
          <View style={s.pillTrack} pointerEvents="none">
            <SlidingPill activeIndex={state.index} tabWidth={tabWidth} />
          </View>
        )}

        <View style={s.tabsRow}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label = (options.title ?? route.name) as string;
            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            };

            return (
              <TabItem
                key={route.key}
                label={label}
                routeName={route.name}
                active={isFocused}
                showLabel={showLabels}
                onPress={onPress}
                onLongPress={onLongPress}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

export const AnimatedTabBar = memo(AnimatedTabBarInner);

const s = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 4,
    backgroundColor: colors.background,
  },
  bar: {
    flexDirection: 'column',
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  topHighlight: {
    height: 1,
    marginHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 1,
  },
  pillTrack: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  pillContainer: {
    position: 'absolute',
    top: 8,
    bottom: 8,
  },
  pill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: PILL_COLOR,
    borderRadius: 14,
    opacity: 0.9,
  },
  pillGlow: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    backgroundColor: PILL_COLOR,
    borderRadius: 16,
    opacity: 0.4,
  },
  tabsRow: {
    flexDirection: 'row',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 14,
    zIndex: 1,
  },
  tabItemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: INACTIVE_COLOR,
    textAlign: 'center',
  },
  labelActive: {
    color: ACTIVE_COLOR,
    fontWeight: '600',
  },
});
