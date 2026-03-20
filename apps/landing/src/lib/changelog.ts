export interface ChangelogCategory {
  label: string;
  entries: string[];
}

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  description: string;
  categories: ChangelogCategory[];
}

export const changelog: ChangelogRelease[] = [
  {
    version: '0.3.1',
    date: '20 March 2026',
    title: 'Search preview and quality-of-life tweaks',
    description:
      'Preview search results before downloading, and quickly check what changed when an update is available.',
    categories: [
      {
        label: 'Search',
        entries: [
          'Preview audio directly from search results by clicking the thumbnail — no download required.',
          'Playback streams through the existing radio protocol so previews work instantly with the player bar.',
        ],
      },
      {
        label: 'Updates',
        entries: [
          'A "View changelog" link now appears in Settings when an update is available, opening the Shiranami website changelog.',
        ],
      },
    ],
  },
  {
    version: '0.3.0',
    date: '20 March 2026',
    title: 'Internet radio and performance overhaul',
    description:
      'Stream internet radio stations, enjoy faster rendering with protocol-based album art, and benefit from a leaner build powered by esbuild.',
    categories: [
      {
        label: 'Radio',
        entries: [
          'Stream internet radio stations via the Radio Browser API with a dedicated Radio view.',
          'Search, browse, and favorite radio stations — favorites persist in the local database.',
          'Radio playback integrates with the existing player bar and audio engine.',
        ],
      },
      {
        label: 'Performance',
        entries: [
          'Album art is now served via a custom protocol instead of base64 blobs, reducing memory usage.',
          'Throttled playback store updates, memoized components, and virtualized the queue panel.',
          'Main process is bundled with esbuild; icon assets optimized from ~885 KB down to ~176 KB.',
        ],
      },
      {
        label: 'Bug fixes',
        entries: [
          'Fixed LRU lyrics cache promoting existing keys and avoiding incorrect eviction.',
          'Enabled Electron fuses for security hardening.',
          'Deduplicated ambient color hook to prevent redundant canvas draws.',
          'Fixed CSP img-src to allow the new art protocol.',
          'Synced app version labels across settings, sidebar, and landing page.',
        ],
      },
    ],
  },
  {
    version: '0.2.1',
    date: '19 March 2026',
    title: 'Quick fix',
    description:
      'Removed the duplicate play/pause button from the favorites hero card — playback controls now live in the player bar only.',
    categories: [
      {
        label: 'Interface',
        entries: [
          'Removed duplicate play/pause button from the favorites "Now Playing" card for consistency with the library view.',
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    date: '19 March 2026',
    title: 'Settings redesign and audio visualizer',
    description:
      'A polish pass on the desktop experience — the settings page got a full redesign, and the audio visualizer now has two styles to match your mood.',
    categories: [
      {
        label: 'Visualizer',
        entries: [
          'Two visualizer styles: soft frequency bars and a dense waveform inspired by ElevenLabs UI.',
          'Style picker in Settings lets you switch between bars and waveform.',
          'Redesigned bar visualizer with center alignment, edge fading, and softer glow.',
          'Visualizer toggle and style preference persist across restarts.',
          'Content no longer hides behind the visualizer strip.',
        ],
      },
      {
        label: 'Settings',
        entries: [
          'Settings page redesigned with sidebar tab navigation.',
          'Each section (Folders, Library, Downloads, Playback, Visualizer, Updates, About) is now its own panel.',
          'Download tools section refactored with cleaner status rows and progress bars.',
          'New reusable Switch component with spring animation.',
        ],
      },
    ],
  },
  {
    version: '0.1.0',
    date: '19 March 2026',
    title: 'First public release',
    description:
      'The first release focuses on turning Shiranami into a stable desktop sanctuary for local listening, playlists, synced lyrics, and one-step downloads.',
    categories: [
      {
        label: 'Player and library',
        entries: [
          'Playback resume restores the selected track, queue, position, and volume after relaunch.',
          'Volume and mute state persist between sessions instead of snapping back to 100%.',
          'Library rescans and search downloads show up immediately without requiring a restart.',
          'The loading spinner on the main transport controls now stays in sync with real playback state.',
        ],
      },
      {
        label: 'Search and downloads',
        entries: [
          'yt-dlp and ffmpeg install together in one guided flow when search tools are missing.',
          'Download progress stays visible across view changes instead of resetting with navigation.',
          'yt-dlp and ffmpeg update buttons now check upstream versions instead of blindly redownloading.',
          'The download folder is configurable from settings, with a reset option back to the default location.',
        ],
      },
      {
        label: 'Playlists and interface',
        entries: [
          'Playlists support custom covers and quick access from the sidebar.',
          'The sidebar can collapse into an icon rail while keeping playlist shortcuts reachable.',
          'The lyrics panel is closed by default so the app opens into a cleaner listening view.',
          'Playback resume waits until the splash screen finishes instead of starting underneath it.',
        ],
      },
      {
        label: 'Packaging and release readiness',
        entries: [
          'Packaged Windows builds now bundle the correct tray icon assets.',
          'Release workflows build desktop artifacts from tags and upload them back to GitHub Releases.',
          'Workspace version bumping and CI-side version syncing now cover the landing page too.',
          'A dedicated landing site and static hosting Dockerfile are part of the repository.',
        ],
      },
    ],
  },
];
