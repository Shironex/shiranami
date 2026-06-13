# Shiranami native addons

Hand-written C++ that Shiranami calls from JavaScript through **N-API**. One
compiled binary, `shiranami_native.node`, hosts every native module.

## Why native?

Some work is too heavy for the JS thread — decoding an entire track to draw a
waveform, loudness analysis, BPM detection. C++ does it in a fraction of the
time, and N-API keeps the ABI stable, so a binary built against Node loads
unchanged inside Electron.

## Layout

```
src/native/
├── addon.cpp            # loader: the single NODE_API_MODULE; calls each module's Register()
├── core/                # pure C++ — no napi.h, reusable & unit-testable
│   ├── peaks.{hpp,cpp}           # reducePeaks(): frames → N bar heights
│   └── audio_decoder.{hpp,cpp}   # decodeAudioFile(): wav/flac/mp3 → float samples (RAII buffer)
├── waveform/            # thin N-API glue over core/ — exports.waveform.{computePeaks,fromFile}
│   └── waveform.{hpp,cpp}
└── vendor/dr_libs/      # vendored public-domain decoders (never edited, never formatted)
    ├── dr_{wav,flac,mp3}.h
    └── dr_libs_impl.cpp          # the one *_IMPLEMENTATION translation unit
```

**Two layers on purpose:**

- **`core/`** is plain C++ with no JS types — read it, test it, reuse it without
  a JS engine. The DSP and memory ownership live here (`DecodedAudio` frees its
  own buffer via RAII; no manual `free`).
- **`<module>/`** is the adapter — it only translates JS values ↔ core calls and
  throws JS errors. Keeping `napi.h` out of `core/` is what makes the core
  portable and unit-testable.

## Build

`node-gyp` compiles `binding.gyp` → `build/Release/shiranami_native.node`.

| command             | what it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `pnpm native:build` | incremental build (skips if the binary is newer than the sources) |
| `pnpm native:clean` | wipe `build/`                                                     |

It also runs automatically before `pnpm dev` / `pnpm build` (the `predev` /
`prebuild` hooks), and `electron-builder` ships the binary to `resources/native/`.

## Editor setup (clangd)

clangd needs the include paths or it reports `'napi.h' file not found`:

- `pnpm native:ide` — writes `compile_commands.json` (git-ignored,
  machine-specific). Re-run after a Node upgrade or after adding sources, then
  restart clangd / reload the window.

## Formatting & linting

The C++ analogues of Prettier and ESLint, both from the LLVM toolchain:

- **clang-format** (≈ Prettier) — style in [`.clang-format`](./.clang-format)
  (Google: 2-space, left-aligned pointers, 80-col).
- **clang-tidy** (≈ ESLint) — checks in [`.clang-tidy`](./.clang-tidy)
  (bugprone / performance / a few modern-C++ idioms).

If your editor has the **clangd extension**, both light up with _no install_ —
format-on-save reads `.clang-format`, and inline diagnostics run the
`.clang-tidy` checks. For the command line:

```sh
brew install clang-format   # formatter only
brew install llvm           # adds clang-tidy
```

| command                    | what it does                                     |
| -------------------------- | ------------------------------------------------ |
| `pnpm native:format`       | format our sources in place (`vendor/` excluded) |
| `pnpm native:format:check` | verify formatting, no writes (exit 1 if dirty)   |
| `pnpm native:lint`         | run clang-tidy (needs `pnpm native:ide` first)   |

Each script **skips gracefully with an install hint** if the binary isn't
present, so they never break a build.

## Adding a new addon (Rung 2 = loudness, Rung 3 = bpm)

1. Create `src/native/<name>/<name>.{hpp,cpp}` with a
   `void Register(Napi::Env, Napi::Object exports)` that sets `exports.<name>`.
2. Put the real algorithm in `src/native/core/` (pure C++) and call it from the glue.
3. List the new `.cpp` files in `binding.gyp` → `sources`.
4. In `addon.cpp`: `#include "<name>/<name>.hpp"` and add one `Register()` line.
5. `pnpm native:build`, then `pnpm native:ide` to refresh include data.

## How JS reaches it (the waveform path)

```
renderer  →  IPC waveform:get-peaks  →  main  →  worker_threads  →  shiranami_native.waveform.fromFile()
```

Decode runs **off the main thread**; results are content-addressed (keyed on
path, mtime, and size) and cached on disk, so each track is decoded once. See
`src/main/waveform-host.ts`, `src/main/waveform-worker.ts`, and
`src/main/ipc/waveform.ts`.
