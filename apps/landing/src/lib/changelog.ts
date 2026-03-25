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
    version: '0.7.0',
    date: '26 March 2026',
    title: 'Crossfade, sleep timer, and quality-of-life improvements',
    description:
      'Smooth transitions between tracks with a new crossfade engine, wind down with a built-in sleep timer, and fine-tune the interface to your liking.',
    categories: [
      {
        label: 'Crossfade',
        entries: [
          'Dual-deck audio engine with equal-power crossfade between tracks — toggle and adjust duration (1-12s) in Settings > Playback.',
          'Both decks route through Web Audio GainNodes for smooth volume ramps and merged visualizer output during transitions.',
          'Crossfade automatically skips for radio streams, repeat-one mode, and tracks shorter than the fade duration.',
        ],
      },
      {
        label: 'Sleep timer',
        entries: [
          'New sleep timer in the player bar with 15, 30, 45, 60, and 90-minute presets.',
          'Shows a live countdown in the tooltip and a pulsing indicator when active. Playback pauses automatically when the timer expires.',
        ],
      },
      {
        label: 'Interface',
        entries: [
          'New Appearance section in Settings with an interface scale slider (80–120%) for adjusting text and UI element sizes.',
          'Update notifications now appear as toasts when a new version is detected, with a quick link to Settings.',
        ],
      },
      {
        label: 'Performance',
        entries: [
          'Desktop main process bundle reduced from 2.0 MB to 568 KB by externalizing npm dependencies at build time.',
        ],
      },
    ],
  },
  {
    version: '0.6.1',
    date: '23 March 2026',
    title: 'Library search and command palette',
    description:
      'Find any track in seconds with a new inline library filter and a global command palette you can open from anywhere.',
    categories: [
      {
        label: 'Search',
        entries: [
          'The library view now has an inline search bar that instantly filters tracks by title, artist, or album — with a result count and a clear button.',
          'A global command palette (Ctrl+K / Cmd+K) lets you search and play any track from any view, or quickly navigate to Library, Favorites, Playlists, and more.',
          'Playing from filtered results sets the queue to the matching subset so next/previous stay within your search.',
        ],
      },
      {
        label: 'Bug fixes',
        entries: [
          'Fixed Discord Rich Presence failing in a loop when a track had a very short or empty artist field (Discord requires at least 2 characters).',
          'Fixed a TypeError on hot-module reload caused by Vite 7 making import.meta.hot.data read-only.',
        ],
      },
    ],
  },
  {
    version: '0.6.0',
    date: '21 March 2026',
    title: 'Compact mode and listening history',
    description:
      'Keep Shiranami close at hand with a dedicated compact player, then look back on your listening habits with a new history and stats view.',
    categories: [
      {
        label: 'Compact mode',
        entries: [
          'Switch the main window into a dedicated compact player layout with art, transport controls, volume, and a tighter scrub bar.',
          'Compact mode restores your previous window bounds when you exit and includes an always-on-top toggle for desk-side playback.',
          'The compact layout received multiple spacing and truncation passes so controls stay readable without overflowing the card.',
        ],
      },
      {
        label: 'History and stats',
        entries: [
          'A new History view shows recent plays, top tracks, top artists, and key listening totals.',
          'Stats support 7-day, 30-day, and all-time ranges, plus a daily activity graph for quick trends.',
          'Listening history is recorded from meaningful sessions instead of every skip, producing cleaner stats.',
        ],
      },
      {
        label: 'Quality',
        entries: [
          'Added a shared Vitest workspace with initial coverage for web UI, desktop IPC, shared utilities, and database logic.',
          'Release safety improved with automated checks around compact mode state, radio loading UI, seek bar behavior, and listening-history queries.',
        ],
      },
    ],
  },
  {
    version: '0.5.1',
    date: '21 March 2026',
    title: 'Radio and playback polish',
    description:
      'A focused polish patch for smoother scrubbing, cleaner Windows window controls, and a more responsive radio browsing flow.',
    categories: [
      {
        label: 'Player',
        entries: [
          'The player seek thumb now snaps straight to the scrubbed position instead of visibly sliding from the old timestamp.',
        ],
      },
      {
        label: 'Radio',
        entries: [
          'Switching between Top Stations, By Country, and Favorites now shows skeleton rows while results load.',
          'Fast tab and country changes no longer let stale radio requests overwrite the newest selection.',
          'The country picker now uses the same shared select styling as the rest of the app instead of a native browser dropdown.',
        ],
      },
      {
        label: 'Interface',
        entries: [
          'Windows title bar controls have been resized and balanced so minimize, maximize, and close feel more consistent.',
        ],
      },
    ],
  },
  {
    version: '0.5.0',
    date: '20 March 2026',
    title: 'Playlist import and library cleanup',
    description:
      'Bring whole playlists in from YouTube or Spotify, review the batch before downloading, and clean up downloaded files with a safer delete flow.',
    categories: [
      {
        label: 'Playlist import',
        entries: [
          'Import full playlists from YouTube and Spotify links into your library.',
          'Preview tracks before downloading and remove individual entries from the import list.',
          'Large YouTube playlists no longer stop at the first 100 tracks.',
        ],
      },
      {
        label: 'Library',
        entries: [
          'Delete from Disk sends tracks to the recycle bin from the context menu.',
          'The delete flow now keeps the library entry intact if moving the file fails.',
        ],
      },
      {
        label: 'Polish',
        entries: [
          'Playlist import lists stay smooth on larger batches thanks to virtualization.',
          'Top bar titles are now correct in the Import Playlist and Radio views.',
        ],
      },
    ],
  },
  {
    version: '0.4.0',
    date: '20 March 2026',
    title: 'Discord Rich Presence',
    description:
      "Show what you're listening to on Discord, plus a smoother playlist submenu experience.",
    categories: [
      {
        label: 'Discord',
        entries: [
          'Discord Rich Presence shows the current track name, artist, album, and time remaining.',
          'Connects automatically on app start with reconnection on disconnect.',
          'Enable or disable it from the Playback section in Settings (off by default).',
        ],
      },
      {
        label: 'Fixes',
        entries: [
          'The "Add to Playlist" submenu no longer disappears when moving the mouse to it.',
        ],
      },
    ],
  },
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
