import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useId } from 'react';

export interface ScrimStop {
  /** 0 to 1, top to bottom. */
  at: number;
  color: string;
  opacity: number;
}

/**
 * A vertical gradient over its parent, for legibility on photos and for the
 * fade above the bottom bar. SVG, because React Native has no CSS gradients.
 */
export function Scrim({ stops }: { stops: readonly ScrimStop[] }) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      pointerEvents="none"
      preserveAspectRatio="none"
    >
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map(stop => (
            <Stop
              key={stop.at}
              offset={stop.at}
              stopColor={stop.color}
              stopOpacity={stop.opacity}
            />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
