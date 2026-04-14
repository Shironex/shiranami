import { TrendingUp, Clock, Headphones, EyeOff } from 'lucide-react';

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
