<a name="top"></a>

<div align="center">
  <img src="apps/desktop/resources/icon-256.png" alt="Shiranami" width="128" height="128" />

  <h1>白波 &nbsp;&middot;&nbsp; Shiranami</h1>

  <p><strong>Your cozy lofi music player.</strong></p>

  <p>
    <a href="https://github.com/Shironex/shiranami/releases/latest">
      <img src="https://img.shields.io/github/v/release/Shironex/shiranami?style=flat&color=blue" alt="GitHub Release" />
    </a>
    <a href="https://github.com/Shironex/shiranami/releases">
      <img src="https://img.shields.io/github/downloads/Shironex/shiranami/total?style=flat&color=green" alt="Downloads" />
    </a>
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-lightgrey" alt="Platform" />
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/License-Source%20Available-orange" alt="License" />
    </a>
  </p>

  <p>
    <a href="https://github.com/Shironex/shiranami/releases/latest"><strong>Download</strong></a>
  </p>
</div>

---

> **Early Development** &mdash; Shiranami is under active development. Expect rough edges, missing features, and breaking changes. Polish translation will be added in a future release.

## What is Shiranami?

Shiranami (白波, "white waves") is a desktop music player built with Electron, designed with a **Midnight Lofi Cafe** aesthetic. It plays your local music library with synced lyrics, audio visualization, and a comfy purple-toned UI featuring a custom mascot.

## Features

- **Local Music Library** &mdash; Scan folders, parse metadata (title, artist, album, cover art), and manage your collection with SQLite persistence
- **Synced Lyrics** &mdash; Automatic lyrics fetching from LRCLIB with click-to-seek on lyric lines and smart multi-query search fallback
- **Audio Visualizer** &mdash; Real-time EQ bars powered by Web Audio API
- **YouTube Download** &mdash; Search and download music via yt-dlp with automatic FFmpeg integration
- **Playlists** &mdash; Create, manage, and reorder custom playlists
- **Favorites** &mdash; Quick-favorite tracks with heart icon
- **Media Controls** &mdash; Hardware media key support and OS media overlay integration
- **System Tray** &mdash; Now-playing info and playback controls in tray context menu
- **Frameless Window** &mdash; Custom titlebar with native window controls
- **Splash Screen** &mdash; Animated mascot with loading messages

## Screenshots

<!-- TODO: Add screenshots -->

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 40 |
| Frontend | React 18, Vite 7, Tailwind CSS v4 |
| State | Zustand v5 |
| Database | SQLite (better-sqlite3, Drizzle ORM) |
| Animations | Motion (Framer Motion v12) |
| Lyrics | LRCLIB API |
| Downloads | yt-dlp, FFmpeg |
| Monorepo | pnpm workspaces |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 9

### Development

```bash
# Clone the repository
git clone https://github.com/Shironex/shiranami.git
cd shiranami

# Install dependencies
pnpm install

# Start development
pnpm dev
```

### Building

```bash
# Build for Windows
pnpm --filter desktop package:win

# Build for macOS
pnpm --filter desktop package
```

## Project Structure

```
shiranami/
├── apps/
│   ├── desktop/          # Electron main process
│   │   ├── src/main/     # Main process (IPC, protocols, services)
│   │   └── resources/    # App icons, mascot
│   └── web/              # React renderer
│       ├── src/
│       │   ├── components/  # UI components
│       │   ├── hooks/       # Audio engine, library actions
│       │   ├── stores/      # Zustand stores
│       │   └── styles/      # Tailwind theme
│       └── public/          # Static assets
├── packages/
│   ├── shared/           # Shared types, utils, constants
│   └── database/         # SQLite schema, migrations
└── scripts/              # Build & release scripts
```

## Version Management

```bash
# Bump patch version (0.1.0 -> 0.1.1)
pnpm version:patch

# Bump minor version (0.1.0 -> 0.2.0)
pnpm version:minor

# Bump major version (0.1.0 -> 1.0.0)
pnpm version:major

# Dry run (preview without changes)
node scripts/bump-version.mjs patch --dry-run
```

## License

This project is licensed under a Source Available License. See [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with care by <a href="https://github.com/Shironex">Shironex</a></sub>
</div>
