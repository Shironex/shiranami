# Shiranami native addons

Hand-written C++ that Shiranami calls from JavaScript through **N-API**. One
compiled binary, `shiranami_native.node`, hosts every native module.

## Why native?

Some work is too heavy for the JS thread — decoding an entire track to draw a
waveform, loudness analysis, BPM detection. C++ does it in a fraction of the
time, and N-API keeps the ABI stable, so a binary built against Node loads
unchanged inside Electron.

## Layout

```text
src/native/
├── addon.cpp            # loader: the single NODE_API_MODULE; calls each module's Register()
├── core/                # pure C++ — no napi.h, reusable & unit-testable
│   ├── peaks.{hpp,cpp}           # reducePeaks(): frames → N bar heights
│   ├── audio_decoder.{hpp,cpp}   # decodeAudioFile(): wav/flac/mp3 → float samples (RAII buffer)
│   ├── loudness.{hpp,cpp}        # measureIntegratedLoudness(): file → EBU R128 LUFS (reuses audio_decoder)
│   ├── fft.{hpp,cpp}             # hand-rolled radix-2 FFT + magnitudeSpectrum() (used by key)
│   ├── tempo.{hpp,cpp}           # estimateBpm(): energy onset envelope → autocorrelation (no FFT)
│   ├── key.{hpp,cpp}             # detectKey(): FFT chromagram → Krumhansl–Schmuckler key profiles
│   └── analysis.{hpp,cpp}        # analyzeAudioFile(): decode once → tempo + key together
├── waveform/            # thin N-API glue over core/ — exports.waveform.{computePeaks,fromFile}
│   └── waveform.{hpp,cpp}
├── loudness/            # thin N-API glue over core/ — exports.loudness.fromFile
│   └── loudness.{hpp,cpp}
├── analysis/            # thin N-API glue over core/ — exports.analysis.fromFile (BPM + key)
│   └── analysis.{hpp,cpp}
└── vendor/              # vendored third-party code (never edited, never formatted)
    ├── dr_libs/                  # public-domain wav/flac/mp3 decoders
    │   ├── dr_{wav,flac,mp3}.h
    │   └── dr_libs_impl.cpp          # the one *_IMPLEMENTATION translation unit
    └── libebur128/               # MIT EBU R128 loudness (jiixyj/libebur128 v1.2.6)
        ├── ebur128.{c,h}
        └── compat/sys/queue.h        # BSD sys/queue.h — Windows-only include (MSVC lacks it)
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

## Testing

Two layers, both run by `pnpm native:test`:

1. **C++ unit tests** (`test/`, [doctest](https://github.com/doctest/doctest))
   exercise the pure `core/` algorithms directly — no JS engine. They link
   `core/` + the vendored decoders into a standalone `shiranami_native_tests`
   executable. That target is **gated** behind the `build_native_tests` gyp
   variable (default off) so `predev` / `prebuild` only ever build the addon;
   `native:test` flips it on with `-Dbuild_native_tests=true`. Fixture audio
   lives in `test/fixtures/` and is located at runtime via the
   `SHIRANAMI_FIXTURE_DIR` env var (the runner sets it).
2. **JS integration tests** (`src/main/workers/native-addon.test.ts`, vitest)
   load the built `.node` the way the app does and assert the N-API surface
   against the same fixtures. The suite `skipIf`s itself when the addon isn't
   built, so a plain `pnpm test` stays green without a native build.

| command            | what it does                                           |
| ------------------ | ------------------------------------------------------ |
| `pnpm native:test` | build gated test target → run C++ tests → run JS tests |

When adding a new `core/` algorithm, add a `test/test_<name>.cpp` and list it in
the `shiranami_native_tests` target's `sources` in `binding.gyp`.

## Adding a new addon

The three planned addons (waveform, loudness, analysis = BPM + key) all ship.
To add another:

1. Create `src/native/<name>/<name>.{hpp,cpp}` with a
   `void Register(Napi::Env, Napi::Object exports)` that sets `exports.<name>`.
2. Put the real algorithm in `src/native/core/` (pure C++) and call it from the glue.
3. List the new `.cpp` files in `binding.gyp` → `sources` (both the addon target
   and the `shiranami_native_tests` target if it has unit tests).
4. In `addon.cpp`: `#include "<name>/<name>.hpp"` and add one `Register()` line.
5. `pnpm native:build`, then `pnpm native:ide` to refresh include data.

## How JS reaches it (the waveform path)

```text
renderer  →  IPC waveform:get-peaks  →  main  →  worker_threads  →  shiranami_native.waveform.fromFile()
```

Decode runs **off the main thread**; results are content-addressed (keyed on
path, mtime, and size) and cached on disk, so each track is decoded once. See
`src/main/waveform-host.ts`, `src/main/waveform-worker.ts`, and
`src/main/ipc/waveform.ts`.

## The loudness path

```text
renderer  →  IPC loudness:analyze  →  main  →  worker_threads  →  shiranami_native.loudness.fromFile()
```

`loudness.fromFile` returns a discriminated `{ status: 'ok' | 'silent' |
'undecodable' }`. The native addon (libebur128) handles the formats dr_libs
decodes (mp3/flac/wav); `undecodable` formats (m4a/opus/ogg) — and the case
where the addon is unavailable — fall back to the ffmpeg `loudnorm` subprocess.
The measured LUFS is persisted on the track row. See
`src/main/workers/loudness-host.ts`, `src/main/workers/loudness-worker.ts`,
`src/main/services/loudness-service.ts`, and `src/main/ipc/loudness.ts`.

## The analysis path (tempo + key)

```text
renderer  →  IPC analysis:analyze  →  main  →  worker_threads  →  shiranami_native.analysis.fromFile()
```

`analysis.fromFile` returns a discriminated `{ status: 'ok', bpm, key } |
{ status: 'unanalyzable' }`. It decodes the file once and runs two estimators:
tempo via an energy onset envelope + autocorrelation (no FFT), and musical key
via an FFT chromagram correlated against the Krumhansl–Schmuckler key profiles.
Both are pure C++ in `core/` and operate on already-decoded PCM, so the doctest
suite exercises them with synthesised signals (a click track, a chord). Unlike
loudness there is **no ffmpeg fallback** — an undecodable format is simply left
unanalysed. The estimated `bpm` + `musicalKey` are persisted on the track row
and shown in the now-playing view. See `src/main/workers/analysis-host.ts`,
`src/main/workers/analysis-worker.ts`, `src/main/services/analysis-service.ts`,
and `src/main/ipc/analysis.ts`.
