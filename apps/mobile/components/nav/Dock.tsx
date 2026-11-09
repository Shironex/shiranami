import { createContext, useContext } from 'react';
import { View } from 'react-native';
import Animated, { Easing, LinearTransition } from 'react-native-reanimated';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scrim } from '@/components/art/Scrim';
import { BottomNav } from '@/components/nav/BottomNav';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { dockBottom } from '@/lib/dock';
import { EASE_OUT_QUART, colors } from '@/lib/theme';

/** Rows fade out behind the dock instead of being cut by its edge. */
const FADE = [
  { at: 0, color: colors.background, opacity: 0 },
  { at: 0.6, color: colors.background, opacity: 1 },
] as const;
const FADE_ABOVE = 72;

/** The dock grows and shrinks over 200 ms when the player row comes and goes. */
const RESIZE = LinearTransition.duration(200).easing(Easing.bezier(...EASE_OUT_QUART));

/** Height the dock covers at the bottom of a tab screen, set by the tabs layout. */
const DockHeightContext = createContext(0);
export const DockHeightProvider = DockHeightContext.Provider;

/** Bottom padding a tab screen's list needs so its last row clears the dock. */
export function useDockInset(): number {
  return useContext(DockHeightContext) + 12;
}

/**
 * The fused dock: the mini player and the tabs as one rounded panel floating
 * above the system navigation, with the same radius as the window header.
 */
export function Dock({
  onHeight,
  ...props
}: BottomTabBarProps & { onHeight: (height: number) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="absolute bottom-0 left-0 right-0 px-2.5"
      style={{ paddingBottom: dockBottom(insets.bottom) }}
      onLayout={e => onHeight(e.nativeEvent.layout.height)}
    >
      <View
        pointerEvents="none"
        className="absolute left-0 right-0"
        style={{ top: -FADE_ABOVE, bottom: 0 }}
      >
        <Scrim stops={FADE} />
      </View>
      <Animated.View
        layout={RESIZE}
        style={{
          overflow: 'hidden',
          borderRadius: 26,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.075)',
          backgroundColor: colors.dock,
          boxShadow: '0 22px 44px -14px rgba(0,0,4,0.95)',
        }}
      >
        <MiniPlayer />
        <BottomNav {...props} />
      </Animated.View>
    </View>
  );
}
