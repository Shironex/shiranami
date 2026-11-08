import { memo } from 'react';
import Heart from 'lucide-react-native/icons/heart';
import { ArtTile } from '@/components/art/ArtTile';
import { EqBars } from '@/components/ui/eq-bars';
import { IconButton } from '@/components/ui/icon-button';
import { ListRow } from '@/components/ui/list-row';
import { stationMeta, type RadioStation } from '@/lib/radio';
import { colors } from '@/lib/theme';

interface StationRowProps {
  station: RadioStation;
  active: boolean;
  playing: boolean;
  saved: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
}

/** A station: kanji tile, name, country and format, then eq bars or the heart. */
function StationRowInner({
  station,
  active,
  playing,
  saved,
  onPress,
  onToggleSaved,
}: StationRowProps) {
  return (
    <ListRow
      art={<ArtTile title={station.name} />}
      title={station.name}
      meta={stationMeta(station)}
      active={active}
      onPress={onPress}
      end={active ? <EqBars playing={playing} /> : null}
      actions={
        <IconButton
          icon={Heart}
          size={20}
          filled={saved}
          color={saved ? colors.favorite : colors.mutedForeground}
          accessibilityLabel={
            saved ? `Remove ${station.name} from favorites` : `Save ${station.name}`
          }
          accessibilityState={{ selected: saved }}
          onPress={onToggleSaved}
        />
      }
    />
  );
}

export const StationRow = memo(StationRowInner);
