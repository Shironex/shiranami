import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { type AnimatedRef, type AnimatedScrollViewProps } from 'react-native-reanimated';
import { Scrim } from '@/components/art/Scrim';

interface FadeScrollProps extends Omit<AnimatedScrollViewProps, 'ref' | 'style'> {
  /** The opaque color behind the list; the edges fade into it. */
  fadeColor: string;
  fadeTop?: number;
  fadeBottom?: number;
  scrollRef?: AnimatedRef<Animated.ScrollView>;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * A vertical list that scrolls inside a fixed box, its rows fading out at the
 * top and bottom edges instead of being cut. The player card (lyrics, up
 * next, similar) and the full screen lyrics all scroll in one of these.
 */
export function FadeScroll({
  fadeColor,
  fadeTop = 24,
  fadeBottom = 36,
  scrollRef,
  style,
  children,
  ...props
}: FadeScrollProps) {
  return (
    <View style={[styles.box, style]}>
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        {...props}
      >
        {children}
      </Animated.ScrollView>
      {fadeTop > 0 && (
        <View pointerEvents="none" style={[styles.top, { height: fadeTop }]}>
          <Scrim
            stops={[
              { at: 0, color: fadeColor, opacity: 1 },
              { at: 1, color: fadeColor, opacity: 0 },
            ]}
          />
        </View>
      )}
      {fadeBottom > 0 && (
        <View pointerEvents="none" style={[styles.bottom, { height: fadeBottom }]}>
          <Scrim
            stops={[
              { at: 0, color: fadeColor, opacity: 0 },
              { at: 1, color: fadeColor, opacity: 1 },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, minHeight: 0 },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});
