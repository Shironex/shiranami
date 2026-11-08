import { memo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { ArtTile } from '@/components/art/ArtTile';
import { Text } from '@/components/ui/text';
import { PRESET_COUNT } from '@/lib/radio-view';
import type { RadioStation } from '@/lib/radio';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';

const GAP = 10;
/** Header padding plus list padding on each side of the screen. */
const SIDE = 16;
const RADIUS = 18;

interface StationPresetsProps {
  stations: RadioStation[];
  activeId: string | null;
  onPlay: (station: RadioStation) => void;
}

/** Saved stations as four big tiles: one tap plays, like the buttons on a car radio. */
function StationPresetsInner({ stations, activeId, onPlay }: StationPresetsProps) {
  const { width } = useWindowDimensions();
  const size = Math.floor((width - SIDE * 2 - GAP * (PRESET_COUNT - 1)) / PRESET_COUNT);
  return (
    <View className="flex-row" style={{ gap: GAP }}>
      {stations.map(station => {
        const on = station.id === activeId;
        return (
          <Pressable
            key={station.id}
            accessibilityRole="button"
            accessibilityLabel={`Play ${station.name}`}
            accessibilityState={{ selected: on }}
            onPress={() => onPlay(station)}
            className="items-center gap-[7px] active:opacity-80"
            style={{ width: size }}
          >
            <View>
              <ArtTile title={station.name} size={size} radius={RADIUS} />
              {on && (
                <View
                  pointerEvents="none"
                  className="absolute inset-0"
                  style={{
                    borderRadius: RADIUS,
                    borderWidth: 2,
                    borderColor: colors.primary,
                    boxShadow: `0 0 0 3px ${colors.primaryTint}`,
                  }}
                />
              )}
            </View>
            <Text
              variant="caption"
              numberOfLines={1}
              className={cn(
                'text-center text-[12.5px] font-body-medium',
                on ? 'text-primary' : 'text-soft-foreground'
              )}
            >
              {station.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const StationPresets = memo(StationPresetsInner);
