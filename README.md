<a name="top"></a>

<div align="center">
  <img src="assets/icon.png" alt="Shiranami" width="128" height="128" />

  <h1>白波 &nbsp;·&nbsp; Shiranami</h1>

  <p><strong>Your personal music sanctuary.</strong></p>

  <p>
    <a href="https://github.com/Shironex/shiranami/releases/latest">
      <img src="https://img.shields.io/github/v/release/Shironex/shiranami?style=flat&color=6f7cff" alt="GitHub Release" />
    </a>
    <a href="https://github.com/Shironex/shiranami/releases">
      <img src="https://img.shields.io/github/downloads/Shironex/shiranami/total?style=flat&color=7fd7ff" alt="Downloads" />
    </a>
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-lightgrey" alt="Platform" />
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/License-Source%20Available-orange" alt="License" />
    </a>
  </p>

  <p>
    <a href="https://github.com/Shironex/shiranami/releases/latest"><strong>Download</strong></a>
    &nbsp;·&nbsp;
    <a href="https://shiranami.app"><strong>Website</strong></a>
    &nbsp;·&nbsp;
    <a href="https://shiranami.app/changelog"><strong>Changelog</strong></a>
  </p>

  <blockquote>
    <p>A calm desktop player for your local music library, internet radio, synced lyrics, YouTube downloads, and full playlist imports, all in one quiet space.</p>
  </blockquote>
</div>

---

### What is Shiranami?

Shiranami is a desktop music player for people who keep their music locally. Instead of pushing you toward a streaming catalog, it wraps around your own folders and files and adds playlists, synced lyrics, internet radio, YouTube downloads, full playlist importing, crossfade, a compact mini player, audio visualizer, listening statistics, and Discord Rich Presence on top — all in a dark lavender interface that stays out of your way.

### Screenshot

<p align="center">
  <img src="assets/library.png" alt="Shiranami library view" width="720" />
  <br />
  <em>Your library, now playing, and queue — all in one calm view.</em>
</p>

### What's inside

|                              |                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------ |
| **Local library**            | Scan your folders, browse tracks, and play from your own collection            |
| **Playlists**                | Create playlists with custom covers and quick access from the sidebar          |
| **Playlist import**          | Pull full YouTube or Spotify playlists into a review list before download      |
| **Internet radio**           | Browse, stream, and favorite stations from Radio Browser                       |
| **Synced lyrics**            | Lyrics that scroll with the music, click any line to seek                      |
| **Search & download**        | Find tracks on YouTube, preview audio, and download with yt-dlp + ffmpeg      |
| **Crossfade**                | Dual-deck engine with equal-power crossfade, configurable from 1 to 12 seconds |
| **Sleep timer**              | Preset durations with a live countdown and auto-pause when time is up          |
| **Compact mode**             | Mini player with always-on-top, full controls in a smaller window              |
| **Audio visualizer**         | Frequency bars or waveform strip rendered above the player bar                 |
| **Listening history**        | Play counts, top tracks and artists, daily activity graph, time-range filters  |
| **Favorites**                | Heart any track and browse them all in a dedicated view                        |
| **Command palette**          | Ctrl+K to search your library and jump to any view instantly                   |
| **Discord Rich Presence**    | Shows the currently playing track in your Discord status                       |
| **Ambient color**            | Extracts the dominant color from album art and tints the entire UI             |
| **Playback resume**          | Volume, queue, track, and position survive restarts                            |
| **System tray & media keys** | Control playback from the tray icon or your keyboard's media keys              |
| **UI scale**                 | Adjust the interface from 80 % to 120 % to match your display                 |
| **Auto-updater**             | In-app updates on Windows, GitHub Releases link on macOS                       |
| **Dark lavender mood**       | One quiet theme that matches the late-night listening vibe                     |

### Getting started

Grab the latest build from [Releases](https://github.com/Shironex/shiranami/releases/latest).

#### Windows

1. Download the `.exe` installer.
2. Run it — Windows might show a SmartScreen warning since the app isn't code-signed. Click **"More info"** then **"Run anyway"**.
3. That's it!

#### macOS

1. Download the `.dmg` file.
2. Open it and drag Shiranami to your Applications folder.
3. macOS will block it because it's unsigned. Open Terminal and run:
   ```bash
   xattr -cr /Applications/Shiranami.app
   ```
   You'll need to run this after each update.

### Built with

|          |                                              |
| -------- | -------------------------------------------- |
| Desktop  | Electron 40                                  |
| Frontend | React 18, Vite 7, Tailwind CSS 4             |
| Database | SQLite, better-sqlite3, Drizzle ORM          |
| Landing  | Astro 6, Tailwind CSS 4                      |
| UI       | Radix UI, Lucide Icons                       |
| State    | Zustand                                      |
| Quality  | ESLint, Prettier, Husky                      |
| CI/CD    | GitHub Actions                               |

### Building from source

You'll need [Node.js](https://nodejs.org/) >= 22 and [pnpm](https://pnpm.io/) >= 10.

```bash
git clone https://github.com/Shironex/shiranami.git
cd shiranami
pnpm install
pnpm dev
```

<details>
<summary>All commands</summary>

```bash
pnpm dev             # Desktop + web
pnpm dev:web         # Renderer only
pnpm dev:landing     # Landing page only
pnpm lint            # Run linter
pnpm typecheck       # Type check
pnpm build           # Build the app
pnpm build:landing   # Build landing page
pnpm package:win     # Package for Windows
pnpm package:mac     # Package for macOS
```

</details>

### Project structure

```
shiranami/
├── apps/
│   ├── desktop/          # Electron main process and packaging
│   ├── landing/          # Astro landing page
│   └── web/              # React renderer
├── packages/
│   ├── database/         # Drizzle schema and DB helpers
│   └── shared/           # Shared types and constants
├── scripts/              # Versioning and build helpers
└── assets/               # Logo, screenshots
```

---

## License

This project is source-available — see the [LICENSE](LICENSE) file for details. You're free to use the app and explore the code, but redistribution, reselling, and derivative works are not permitted.

---

<p align="center">
  Made with &#10084; by <a href="https://github.com/Shironex">Shironex</a>
</p>

[Back to top](#top)
