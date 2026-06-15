import { useCallback, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderOpen,
  HardDrive,
  ArrowDownToLine,
  Disc3,
  Settings2,
  SlidersHorizontal,
  AudioLines,
  Captions,
  PictureInPicture2,
  Monitor,
  Sparkles,
  PanelLeft,
  PanelTop,
  RefreshCcw,
  Info,
  Heart,
  MessageCircle,
  Radio,
  ShieldCheck,
  CloudSun,
  MonitorCog,
} from 'lucide-react';
import { MusicFoldersSection } from '@/components/settings/MusicFoldersSection';
import { LibrarySection } from '@/components/settings/LibrarySection';
import { MetadataEnrichSection } from '@/components/settings/MetadataEnrichSection';
import { DownloadsSection } from '@/components/settings/downloads/DownloadsSection';
import { PlaybackSection } from '@/components/settings/PlaybackSection';
import { EqualizerSection } from '@/components/settings/EqualizerSection';
import { VisualizerSection } from '@/components/settings/VisualizerSection';
import { UpdatesSection } from '@/components/settings/UpdatesSection';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { SidebarSection } from '@/components/settings/SidebarSection';
import { VisualEffectsSection } from '@/components/settings/VisualEffectsSection';
import { InterfaceSection } from '@/components/settings/InterfaceSection';
import { LyricsSection } from '@/components/settings/LyricsSection';
import { CompactSection } from '@/components/settings/CompactSection';
import { AboutSection } from '@/components/settings/AboutSection';
import { SupportSection } from '@/components/settings/SupportSection';
import { DiscordSection } from '@/components/settings/DiscordSection';
import { PrivacySection } from '@/components/settings/PrivacySection';
import { WeatherSection } from '@/components/settings/WeatherSection';
import { ScrobbleSection } from '@/components/settings/ScrobbleSection';
import { SystemSection } from '@/components/settings/SystemSection';
import type {
  ISectionGroup,
  ISettingsNavGroup,
  ISettingsSection,
  ISettingsSectionEntry,
  ISettingsViewView,
} from './SettingsView.types';

const GROUP_ORDER: ISectionGroup[] = ['library', 'playback', 'appearance', 'system'];

const GROUP_LABELS: Record<ISectionGroup, string> = {
  library: 'groups.library',
  playback: 'groups.playback',
  appearance: 'groups.appearance',
  system: 'groups.system',
};

const SECTIONS: ISettingsSectionEntry[] = [
  {
    id: 'folders',
    labelKey: 'musicFolders',
    subtitleKey: 'subtitles.folders',
    Icon: FolderOpen,
    group: 'library',
  },
  {
    id: 'library',
    labelKey: 'library',
    subtitleKey: 'subtitles.library',
    Icon: HardDrive,
    group: 'library',
  },
  {
    id: 'enrich',
    labelKey: 'enrich',
    subtitleKey: 'subtitles.enrich',
    Icon: Disc3,
    group: 'library',
  },
  {
    id: 'downloads',
    labelKey: 'downloads',
    subtitleKey: 'subtitles.downloads',
    Icon: ArrowDownToLine,
    group: 'library',
  },
  {
    id: 'playback',
    labelKey: 'playback',
    subtitleKey: 'subtitles.playback',
    Icon: Settings2,
    group: 'playback',
  },
  {
    id: 'equalizer',
    labelKey: 'equalizer',
    subtitleKey: 'subtitles.equalizer',
    Icon: SlidersHorizontal,
    group: 'playback',
  },
  {
    id: 'visualizer',
    labelKey: 'visualizer',
    subtitleKey: 'subtitles.visualizer',
    Icon: AudioLines,
    group: 'playback',
  },
  {
    id: 'lyrics',
    labelKey: 'lyrics',
    subtitleKey: 'subtitles.lyrics',
    Icon: Captions,
    group: 'playback',
  },
  {
    id: 'compact',
    labelKey: 'compact',
    subtitleKey: 'subtitles.compact',
    Icon: PictureInPicture2,
    group: 'appearance',
  },
  {
    id: 'appearance',
    labelKey: 'appearance',
    subtitleKey: 'subtitles.appearance',
    Icon: Monitor,
    group: 'appearance',
  },
  {
    id: 'effects',
    labelKey: 'effects',
    subtitleKey: 'subtitles.effects',
    Icon: Sparkles,
    group: 'appearance',
  },
  {
    id: 'interface',
    labelKey: 'interface',
    subtitleKey: 'subtitles.interface',
    Icon: PanelTop,
    group: 'appearance',
  },
  {
    id: 'sidebar',
    labelKey: 'sidebar',
    subtitleKey: 'subtitles.sidebar',
    Icon: PanelLeft,
    group: 'appearance',
  },
  {
    id: 'weather',
    labelKey: 'weather',
    subtitleKey: 'subtitles.weather',
    Icon: CloudSun,
    group: 'appearance',
  },
  {
    id: 'system',
    labelKey: 'system',
    subtitleKey: 'subtitles.system',
    Icon: MonitorCog,
    group: 'system',
  },
  {
    id: 'scrobble',
    labelKey: 'scrobble',
    subtitleKey: 'subtitles.scrobble',
    Icon: Radio,
    group: 'system',
  },
  {
    id: 'discord',
    labelKey: 'discord',
    subtitleKey: 'subtitles.discord',
    Icon: MessageCircle,
    group: 'system',
  },
  {
    id: 'updates',
    labelKey: 'updates',
    subtitleKey: 'subtitles.updates',
    Icon: RefreshCcw,
    group: 'system',
  },
  {
    id: 'privacy',
    labelKey: 'privacy',
    subtitleKey: 'subtitles.privacy',
    Icon: ShieldCheck,
    group: 'system',
  },
  { id: 'about', labelKey: 'about', subtitleKey: 'subtitles.about', Icon: Info, group: 'system' },
  {
    id: 'support',
    labelKey: 'support',
    subtitleKey: 'subtitles.support',
    Icon: Heart,
    group: 'system',
  },
];

const SECTION_PANEL: Record<ISettingsSection, ComponentType> = {
  folders: MusicFoldersSection,
  library: LibrarySection,
  enrich: MetadataEnrichSection,
  downloads: DownloadsSection,
  playback: PlaybackSection,
  equalizer: EqualizerSection,
  visualizer: VisualizerSection,
  lyrics: LyricsSection,
  compact: CompactSection,
  appearance: AppearanceSection,
  effects: VisualEffectsSection,
  interface: InterfaceSection,
  sidebar: SidebarSection,
  weather: WeatherSection,
  system: SystemSection,
  scrobble: ScrobbleSection,
  discord: DiscordSection,
  updates: UpdatesSection,
  privacy: PrivacySection,
  about: AboutSection,
  support: SupportSection,
};

const ACTIVE_FALLBACK = SECTIONS[0];

export function useSettingsView(): ISettingsViewView {
  const { t } = useTranslation('settings');
  const [activeSection, setActiveSection] = useState<ISettingsSection>('folders');

  const activeEntry = SECTIONS.find(s => s.id === activeSection) ?? ACTIVE_FALLBACK;
  const Panel = SECTION_PANEL[activeSection];

  const navGroups: ISettingsNavGroup[] = GROUP_ORDER.map(group => ({
    group,
    label: t(GROUP_LABELS[group]),
    items: SECTIONS.filter(s => s.group === group),
  }));

  const onSelectSection = useCallback((id: ISettingsSection) => setActiveSection(id), []);

  return {
    t,
    activeSection,
    activeEntry,
    Panel,
    navGroups,
    sectionsAriaLabel: t('app.sectionsAriaLabel'),
    onSelectSection,
  };
}
