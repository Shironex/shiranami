import {
  TrendingUp,
  Clock,
  Headphones,
  EyeOff,
  Brain,
  Moon,
  Sunrise,
  CloudRain,
  Sun,
  Snowflake,
  CalendarClock,
} from 'lucide-react';
import type { SmartMixResult } from '@shiranami/contracts';

export type MixId = 'most-played' | 'recently-added' | 'recently-played' | 'never-played';

export interface MixDefinition {
  id: MixId;
  titleKey: string;
  descKey: string;
  emptyKey: string;
  icon: typeof TrendingUp;
}

export const MIX_DEFINITIONS: MixDefinition[] = [
  {
    id: 'most-played',
    titleKey: 'mostPlayed',
    descKey: 'mostPlayedDesc',
    emptyKey: 'emptyMostPlayed',
    icon: TrendingUp,
  },
  {
    id: 'recently-added',
    titleKey: 'recentlyAdded',
    descKey: 'recentlyAddedDesc',
    emptyKey: 'emptyMix',
    icon: Clock,
  },
  {
    id: 'recently-played',
    titleKey: 'recentlyPlayed',
    descKey: 'recentlyPlayedDesc',
    emptyKey: 'emptyRecentlyPlayed',
    icon: Headphones,
  },
  {
    id: 'never-played',
    titleKey: 'neverPlayed',
    descKey: 'neverPlayedDesc',
    emptyKey: 'emptyMix',
    icon: EyeOff,
  },
];

export const MIX_LIMIT = 50;

/** Icon per smart-mix kind, used by the "For you" section in the mixes grid. */
export const SMART_MIX_ICONS: Record<SmartMixResult['kind'], typeof TrendingUp> = {
  focus: Brain,
  'late-night': Moon,
  morning: Sunrise,
  'rainy-day': CloudRain,
  'sunny-day': Sun,
  'snowy-day': Snowflake,
  decade: CalendarClock,
};
