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

const SECTIONS: { id: SettingsSection; labelKey: string; Icon: typeof FolderOpen }[] = [
  { id: 'folders', labelKey: 'musicFolders', Icon: FolderOpen },
  { id: 'library', labelKey: 'library', Icon: HardDrive },
  { id: 'downloads', labelKey: 'downloads', Icon: ArrowDownToLine },
  { id: 'playback', labelKey: 'playback', Icon: Settings2 },
  { id: 'equalizer', labelKey: 'equalizer', Icon: SlidersHorizontal },
  { id: 'visualizer', labelKey: 'visualizer', Icon: AudioLines },
  { id: 'lyrics', labelKey: 'lyrics', Icon: Captions },
  { id: 'compact', labelKey: 'compact', Icon: PictureInPicture2 },
  { id: 'appearance', labelKey: 'appearance', Icon: Monitor },
  { id: 'updates', labelKey: 'updates', Icon: RefreshCcw },
  { id: 'about', labelKey: 'about', Icon: Info },
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

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Section navigation */}
      <div
        className="w-44 shrink-0 border-r border-border/40 p-3 space-y-0.5"
        role="tablist"
        aria-label="Settings sections"
      >
        {SECTIONS.map(section => (
          <button
            key={section.id}
            role="tab"
            aria-selected={activeSection === section.id}
            onClick={() => setActiveSection(section.id)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm',
              'transition-all duration-150',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              activeSection === section.id
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground/80'
            )}
          >
            <section.Icon className="w-4 h-4 shrink-0" />
            {t(section.labelKey)}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 pb-20" role="tabpanel">
        <div className="max-w-xl space-y-4">
          <Panel />
        </div>
      </div>
    </div>
  );
}

export default SettingsView;
