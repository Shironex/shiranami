import {
  Heart,
  History,
  Library,
  ListMusic,
  ListPlus,
  Radio,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { AppView } from '@/stores/useViewStore';

export interface ToggleableSidebarItem {
  id: AppView;
  key: string;
  Icon: LucideIcon;
}

export const SETTINGS_SIDEBAR_ITEMS: ToggleableSidebarItem[] = [
  { id: 'library', key: 'library', Icon: Library },
  { id: 'playlists', key: 'playlists', Icon: ListMusic },
  { id: 'favorites', key: 'favorites', Icon: Heart },
  { id: 'history', key: 'history', Icon: History },
  { id: 'mixes', key: 'mixes', Icon: Sparkles },
  { id: 'search', key: 'search', Icon: Search },
  { id: 'import-playlist', key: 'importPlaylist', Icon: ListPlus },
  { id: 'radio', key: 'radio', Icon: Radio },
];
