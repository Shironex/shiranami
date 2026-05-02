import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderOpen,
  HardDrive,
  ArrowDownToLine,
  Settings2,
  SlidersHorizontal,
  AudioLines,
  Captions,
  PictureInPicture2,
  Monitor,
  RefreshCcw,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import { MusicFoldersSection } from '@/components/settings/MusicFoldersSection';
import { LibrarySection } from '@/components/settings/LibrarySection';
import { DownloadsSection } from '@/components/settings/downloads/DownloadsSection';
import { PlaybackSection } from '@/components/settings/PlaybackSection';
import { EqualizerSection } from '@/components/settings/EqualizerSection';
import { VisualizerSection } from '@/components/settings/VisualizerSection';
import { UpdatesSection } from '@/components/settings/UpdatesSection';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { LyricsSection } from '@/components/settings/LyricsSection';
import { CompactSection } from '@/components/settings/CompactSection';
import { AboutSection } from '@/components/settings/AboutSection';

type SettingsSection =
  | 'folders'
  | 'library'
  | 'downloads'
  | 'playback'
  | 'equalizer'
  | 'visualizer'
  | 'lyrics'
  | 'compact'
  | 'appearance'
  | 'updates'
  | 'about';

type SectionGroup = 'library' | 'playback' | 'appearance' | 'system';

const GROUP_ORDER: SectionGroup[] = ['library', 'playback', 'appearance', 'system'];

const GROUP_LABELS: Record<SectionGroup, string> = {
  library: 'groups.library',
  playback: 'groups.playback',
  appearance: 'groups.appearance',
  system: 'groups.system',
};

const SECTIONS: {
  id: SettingsSection;
  labelKey: string;
  subtitleKey: string;
  Icon: typeof FolderOpen;
  group: SectionGroup;
}[] = [
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
    id: 'updates',
    labelKey: 'updates',
    subtitleKey: 'subtitles.updates',
    Icon: RefreshCcw,
    group: 'system',
  },
  { id: 'about', labelKey: 'about', subtitleKey: 'subtitles.about', Icon: Info, group: 'system' },
];

const SECTION_PANEL: Record<SettingsSection, ComponentType> = {
  folders: MusicFoldersSection,
  library: LibrarySection,
  downloads: DownloadsSection,
  playback: PlaybackSection,
  equalizer: EqualizerSection,
  visualizer: VisualizerSection,
  lyrics: LyricsSection,
  compact: CompactSection,
  appearance: AppearanceSection,
  updates: UpdatesSection,
  about: AboutSection,
};

export function SettingsView() {
  const { t } = useTranslation('settings');
  const [activeSection, setActiveSection] = useState<SettingsSection>('folders');
  const Panel = SECTION_PANEL[activeSection];
  const activeEntry = SECTIONS.find(s => s.id === activeSection)!;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SettingsHeader
        icon={activeEntry.Icon}
        title={t(activeEntry.labelKey)}
        subtitle={t(activeEntry.subtitleKey)}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Section navigation */}
        <div
          className="w-48 shrink-0 border-r border-border/40 p-3"
          role="tablist"
          aria-label="Settings sections"
        >
          {GROUP_ORDER.map(group => {
            const items = SECTIONS.filter(s => s.group === group);
            return (
              <div key={group} className="mb-1.5">
                <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/80 px-3 mb-1.5 mt-3 first:mt-0">
                  {t(GROUP_LABELS[group])}
                </div>
                {items.map(section => {
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveSection(section.id)}
                      title={t(section.labelKey)}
                      className={cn(
                        'relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm',
                        'transition-all duration-150',
                        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                        isActive
                          ? 'bg-primary/15 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground/80'
                      )}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-primary"
                        />
                      )}
                      <section.Icon className="w-4 h-4 shrink-0" />
                      <span className="min-w-0 truncate whitespace-nowrap">
                        {t(section.labelKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 pb-20" role="tabpanel">
          <div className="max-w-xl space-y-4">
            <Panel />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsView;
