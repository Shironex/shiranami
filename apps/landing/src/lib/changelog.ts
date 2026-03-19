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
