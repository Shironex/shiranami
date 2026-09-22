# Shiranami v2 — Feature Ideation: VISUAL & AMBIENT EXPERIENCE

Research lens: what makes a calm, local-first lofi player feel like a _place_ rather than an app.
Grounded in a read-only pass over `apps/web/src` + `crates/` + `apps/desktop-tauri/src-tauri`.

---

## Part 0 — What already exists (so nothing here duplicates it)

| Surface                       | Where                                                                                                             | State                                                                                                                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12 audio-reactive visualizers | `apps/web/src/components/player/*Visualizer/`, registry at `apps/web/src/components/player/visualizerRegistry.ts` | Canvas 2D, code-split via `lazy()`, all share `apps/web/src/hooks/useVisualizerFrame.ts` (DPR resize, buffer reuse, rgb hoist, 30fps cap)                                                                                                                                |
| Live analyser                 | `apps/web/src/lib/audioAnalyser.ts`                                                                               | Dual-deck graph → mix → preamp → dry/EQ split → limiter → **AnalyserNode** → destination. `fftSize 256`, `smoothing 0.8`. `getAnalyser()` is a module singleton                                                                                                          |
| Ambient color                 | `apps/web/src/hooks/useAmbientColor.tsx`                                                                          | **One** average color per cover (FastAverageColor), 100-entry LRU keyed on the content-addressed art URL, `{rgb, hex, isDark}`                                                                                                                                           |
| Ambient glow                  | `apps/web/src/components/shared/AmbientBackground/`                                                               | Three static radial-gradients at 10%/6%/3% alpha + a 1.1s bloom pulse on track change + optional feTurbulence noise                                                                                                                                                      |
| Theme backgrounds             | `apps/web/src/components/shared/ThemeBackground/`, images in `apps/web/public/themes/`                            | 5 static `.webp` (lofi-night, snow, summer, sunset, wisteria) + WCAG scrim + user opacity/blur/dim sliders (`apps/web/src/stores/useThemeBgStore.ts`)                                                                                                                    |
| Now Playing                   | `apps/web/src/components/now-playing/NowPlayingView/NowPlayingView.tsx`                                           | An in-app **view** (container-query responsive), art + info + seekbar + a lyrics/queue/EQ panel. **Not fullscreen — there is no fullscreen mode anywhere in the app**                                                                                                    |
| Waveform seekbar              | `apps/web/src/components/player/WaveformSeekbar/` + `apps/web/src/hooks/useWaveformPeaks.ts`                      | 512 native-decoded peaks, disk-cached, rasterised once per track/geometry/accent                                                                                                                                                                                         |
| Compact mode                  | `apps/web/src/components/player/CompactPlayer/` + `apps/desktop-tauri/src-tauri/src/compact.rs`                   | The **main window resized** to 500×214, always-on-top pin, marquee, ambient radial, lyrics popover. Bounds/work-area validation is already written and unit-tested                                                                                                       |
| Accent                        | `apps/web/src/stores/useAccentStore.ts`                                                                           | Manual hex presets → inline `--primary`, `--primary-rgb`, `--primary-foreground`, `--ring` on `<html>` with a WCAG foreground pick                                                                                                                                       |
| Accent propagation            | `apps/web/src/hooks/usePrimaryRGB.ts`                                                                             | `MutationObserver` on `<html>` for `class`/`style`/`data-theme` → **every canvas visualizer recolors automatically when `--primary-rgb` changes.** This is the single highest-leverage seam in the visual layer                                                          |
| Time of day                   | `apps/web/src/hooks/useCurrentHour.ts`, `apps/web/src/components/overview/overviewUtils.ts`                       | Hourly tick + greeting buckets + a decorative kanji watermark in `GreetingHero`                                                                                                                                                                                          |
| Weather                       | `apps/web/src/stores/useWeatherStore.ts`, `apps/web/src/hooks/queries/useWeather.ts`                              | Opt-in, city coords, `WeatherCurrent { tempC, condition, label }` with `condition` already a coarse bucket: `clear \| partly_cloudy \| cloudy \| rain \| snow \| thunderstorm \| fog \| unknown`. Rendered as one text row on the Overview clock card                    |
| Particle precedent            | `apps/web/src/hooks/useSplashRain.ts`                                                                             | A **complete, tuned rain-streak canvas**: deterministic hashed seeding, 60Hz physics / 30Hz redraw, DPR-correct CSS-pixel space, reads `--foreground` via `oklch(from …)`, static-frame fallback under reduced-motion/low-perf. Currently used only by the splash screen |
| Motion gates                  | `apps/web/src/hooks/useDecorativeMotion.ts`, `apps/web/src/hooks/useRafLoop.ts`                                   | One gate for decorative motion (reduced-motion + low-perf); RAF loop gated on _activity + page visibility + IntersectionObserver_                                                                                                                                        |
| Mascot                        | `apps/web/public/mascot.png`, `apps/web/src/components/shared/ViewEmptyState/MascotIdleNote/`                     | A single static PNG with a shared `float-mascot` CSS keyframe. Empty states and search only — never near the player                                                                                                                                                      |
| Share                         | `apps/web/src/components/shared/ShareDialog/`                                                                     | Link + QR only. **No image/card export**                                                                                                                                                                                                                                 |
| Rust analysis                 | `crates/shiranami-audio/src/`                                                                                     | `symphonia` decode → `PcmSink` trait; `peaks` (512 buckets + on-disk cache) and `loudness` (`ebur128`) are the two sinks today. **BPM is a documented, test-pinned seam** (`crates/shiranami-audio/tests/sink_seam.rs`, `realfft` planned)                               |
| Art delivery                  | `docs/v2/architecture.md` §2.4, `apps/web/src/lib/bridge/stream-urls.ts`                                          | Loopback axum server, `/{tok}/art/<hash>.jpg`, 5 MB LRU, `Cache-Control: immutable`, CORS open — so **art is canvas-readable and cheap to re-request at other sizes**                                                                                                    |
| Windowing                     | `apps/desktop-tauri/src-tauri/src/commands/window.rs`, `tauri.conf.json`                                          | One window (`label: "main"`, `decorations: false`). `window_minimize/maximize/close/is_maximized/set_always_on_top/set_compact_mode` exist. **No fullscreen command, no second window**                                                                                  |
| Stack facts                   | `apps/web/package.json`                                                                                           | React 19, `motion` 12, Tailwind v4 (`oklch(from …)` relative color already used in `globals.css`), zustand, **no WebGL, no three.js, no shader code anywhere**                                                                                                           |

**Gaps that jump out:** no fullscreen/immersive mode; no idle/screensaver behaviour; only _one_ color per cover; theme backgrounds are static bitmaps; the weather is a text label, not an atmosphere; the mascot never appears while music plays; nothing is exportable as an image; the beautiful rain engine is used on one screen for two seconds.

---

## Part 1 — Landscape (2025-2026)

**Immersive/fullscreen now-playing is the single most-requested visual feature in the category.**
Spotify's "Full screen playback info and visuals (Desktop)" idea thread runs to nine+ pages and is one of the longest-lived requests on their community; a parallel thread begs them to _bring back_ the removed full-window Now Playing view. Cider (a paid Apple Music client) is repeatedly reviewed as worth its price largely on the strength of one feature — "immersive mode displays a stunning full-screen collage of the currently-playing track's album art and auto-scrolling song lyrics atop an animated color-coordinated backsplash." Harmonoid is praised for a now-playing view that "expands with a soft gradient pulled straight from the album art… immersive without being distracting." Apple shipped exactly this to the iOS 26 Lock Screen (tap the art → it expands and animates, controls float on top in Liquid Glass).

**Album-art-driven color has moved past "average color."**
Spotify extracts a palette and applies gradient + auto-contrast text + blurred overlays with animated transitions. Apple Music went further and does **not** sample colors at all: reverse-engineering of the Apple Music Web bundle shows **four square copies of the album art at 25%, 50%, 80% and 125% of viewport width, the smaller ones travelling circular paths while rotating, each twisted by a radial rotation shader and gaussian-blurred, with the artwork saturation boosted**. The result reads as the record itself dissolved into light. That is reproducible in plain CSS at a fraction of the cost if you accept blur+drift without the twist shader.

**Ambient scenes are the whole product for the lofi-adjacent competition.**
lofi.co sells interactive original artworks where clicking things changes both the sound _and_ the scene; lofi.cafe sells a pixel café where "the way the rain gently falls, or a subtle flicker of a neon sign… adds so much character"; Lofizen bundles 35+ layerable ambiences with the visuals. These are not music players — they are _rooms_. Shiranami has the library, the audio quality and the local-first story they lack, and has 5 beautiful static rooms that don't move.

**Screensaver/idle ambience is a live niche.** Fliqlo (a flip clock) is one of the most-installed screensavers on earth for no reason other than "turns an idle screen into a readable desk clock without visual noise." Plane9 and Lively Wallpaper both sell audio-reactive idle scenes; Electric Sheep sells slow generative abstraction. Cymata (2025, App Store) explicitly markets "calm modes" and "slow ambient motion" as distinct from beat-driven visuals.

**Lyric typography is a design surface, not a text dump.** Apple's synced lyrics are described as "highlighted lyrics of the current sentence appear to be floating on the surface, making them very eye-catching, while the lyrics behind seem to be looming in the deep water" — depth via blur/opacity, not just color. Meanwhile "Spotify lyric card" generators are a genuine cottage industry (multiple TikTok trends, half a dozen open-source generators) because the app itself under-serves the share moment.

**MilkDrop is having a revival** via Butterchurn (WebGL, thousands of presets, a Chrome extension, a 4-deck VJ rig in Electron). Technically it drops into an existing `AnalyserNode` in an afternoon — but it is a _rave_ aesthetic and would import 16,000 presets of visual noise into a sanctuary. Noted as an anti-recommendation.

**Seasonal/time-of-day theming is an established 2025-26 engagement pattern** — "bright themes during daylight shift to darker themes at night" is now table stakes in trend roundups, and seasonal theming is specifically credited with "enhancing emotional connection." Shiranami already has the clock and the weather; it just doesn't spend them.

Sources: Spotify Community full-screen idea threads; AppleInsider/MacRumors on iOS 26 animated album art; howtogeek on Cider immersive mode; makeuseof on Harmonoid; aadishv.dev "Reverse engineering Apple Music's background gradient"; lofi.co / lofi.cafe / Lofizen product pages; jberg/butterchurn; positioniseverything & livelywallpaper screensaver roundups; Cymata App Store listing; design-encyclopedia on seasonal UI theming.

---

## Part 2 — Proposals (ranked)

Effort is in agent-days. Wow-per-effort is 1-5 (5 = release-note headline for the cost).

---

### 1. Sanctuary Mode — fullscreen immersive player + idle screensaver

**Wow/effort: 5 · Effort: M (2.5-3 days)**

Press `F` (or click the art) and the app dissolves: window goes true fullscreen, chrome fades out after four seconds of stillness, and what's left is the cover at the size of your monitor, the artwork bloom breathing behind it, the synced lyric line in the serif italic display face, and a hairline waveform at the bottom edge. Move the mouse and the controls swim back up. Leave it playing and untouched for N minutes and it enters **on its own** — your desk gets a lofi display, with an optional clock/weather variant that shows the time large and the track small. Any key or pointer move drops you back exactly where you were.

_Why it fits:_ this is shiranami's identity taken to its conclusion — the sanctuary you can actually sit inside. It is also the single most-requested thing in this entire product category (Spotify's longest-running desktop idea thread; the one feature people pay Cider for).

_Builds on:_ `NowPlayingView.tsx` + `NowPlayingView.hooks.ts` (the responsive layout, panel state and lyrics wiring already exist — Sanctuary is a second presentation of the same hook, ideally with the container-query classes reused at a larger breakpoint); `AmbientBackground`; `LyricsBody` + `useLyricsView`; `useKeyboardShortcuts.ts` (already owns Escape and single-letter shortcuts); `useDecorativeMotion`; `useCurrentHour` + `useWeatherQuery` for the clock variant; `WaveformSeekbar` with a taller `canvasClassName` (it already takes one).

_Rust leverage:_ **real, and load-bearing.** Two new commands next to `window_set_always_on_top` in `apps/desktop-tauri/src-tauri/src/commands/window.rs`: `window_set_fullscreen(bool)`, and a display-sleep inhibitor for the screensaver variant (a screensaver that the OS screensaver kills is worse than nothing). The `compact.rs` precedent — record-the-bounds-you-came-from, restore on exit, unit-tested `plan()` — is the exact shape to copy for enter/exit.

_Watch out for:_ idle detection must count _pointer + keyboard in the webview_, and must not fire while a dialog/command palette is open; auto-entry needs to be opt-in with a duration picker (some people will hate it); on macOS, native fullscreen creates a Space — decide between `set_fullscreen` and a borderless maximized "presentation" mode and pin the choice; the low-perf path should render a still frame, not nothing.

---

### 2. Artwork Bloom — the album art _is_ the background

**Wow/effort: 5 · Effort: S-M (1.5-2 days)**

Retire the three flat radial gradients. Instead, take the cover itself, lay down four copies at ~25% / 50% / 80% / 125% of the viewport, blur them into oblivion, push the saturation, and let the small ones drift along slow circular paths while counter-rotating. The background stops being "a purple haze extracted from the record" and becomes "the record, dissolved into light" — different for every album, alive without ever moving fast enough to notice.

_Why it fits:_ it is the highest visual-quality-per-line change available, it applies to **every view, every track, always**, and slow drift at 0.02Hz is the definition of calm. This is the technique Apple Music actually uses, minus the shader.

_Builds on:_ `AmbientBackground.tsx` / `.hooks.ts` — same component, same `enabled`/low-perf/reduced-motion gates, same z-0 slot, swap the `glowBackground` string for four `<img>` layers animated by `motion`. `useAmbientColor` stays as the _fallback_ layer and as the text-contrast oracle. Art URLs are already CORS-open and immutable via the loopback server.

_Rust leverage:_ optional but tidy — the art route (`/{tok}/art/<hash>.jpg`, 5 MB LRU) can grow a `?w=` param so the renderer blurs a 96px thumbnail instead of a 1000px JPEG. That makes the whole effect nearly free and reuses the existing LRU. **No WebGL required**: `filter: blur() saturate()` + `transform` are GPU-composited, and the drift can be pure CSS keyframes so it costs zero JS per frame.

_Watch out for:_ blur radius must scale with viewport or it looks grainy on 4K; `will-change`/`contain` to keep it off the main paint; large blurred layers can spike GPU memory on integrated graphics — keep it behind the existing `lowPerformanceMode` gate and cap layer count there; light themes (summer/sunset) need the existing `theme-bg-scrim` to still win, so the bloom must sit _between_ the theme image and the scrim, or get its own dim.

---

### 3. Living Scenes — time-of-day light + real-weather atmosphere on the theme backgrounds

**Wow/effort: 5 · Effort: M (2.5-3 days)**

The five theme rooms wake up. A slow light curve drifts the scrim from dawn-warm through midday-neutral to a deep blue night across your actual day, so wisteria at 7am and wisteria at 11pm are different places. And if you've opted into weather, the room borrows the sky: rain streaks down the glass when it's raining in your city, snow drifts when it's snowing, mist thickens on fog, the light flattens under overcast. Nobody else's music player knows it's raining outside.

_Why it fits:_ it is the exact thing lofi.co and lofi.cafe sell, done with _your_ weather instead of a canned loop, and it makes the existing themes worth choosing between. It's also the strongest identity feature in this list — "the app that knows what the sky is doing" is a sentence people repeat.

_Builds on:_ `ThemeBackground.tsx` already stacks image → scrim → dim, so this is one more layer plus a driven `--theme-bg-*` curve; `useSplashRain.ts` **is already the particle engine** (hashed deterministic seeding, 60Hz physics / 30Hz redraw, CSS-pixel DPR correctness, `oklch(from …)` color reads, static-frame fallback) — generalize it into `useAmbientParticles({ preset })` with rain / snow / petals / dust / none and it's ~70% written; `useCurrentHour`; `useWeatherStore` + `useWeatherQuery`, whose `condition` union (`clear | partly_cloudy | cloudy | rain | snow | thunderstorm | fog | unknown`) maps 1:1 onto presets; `useThemeBgStore` for the intensity slider; `useRafLoop`'s visibility+intersection gating.

_Rust leverage:_ none needed — `weather_get_current` already exists and is cached at 15 min.

_Watch out for:_ must be independently toggleable (weather-atmosphere on/off, time-of-day on/off) and default to _subtle_; particles must never cross the scrim's contrast floor; thunderstorm should NOT flash (that's the rave failure mode — use a slow luminance swell instead); the "unknown" bucket needs a defined no-op; southern-hemisphere/seasonal mapping should follow weather, not calendar month, precisely to avoid getting it backwards.

---

### 4. Palette theming — five swatches per cover, and an optional "follow the record" accent

**Wow/effort: 4 · Effort: S (1-1.5 days)**

Extract a real palette per cover — dominant, vibrant, muted, dark, light — publish it as `--art-1…--art-5` plus a contrast-safe ink color, and offer an accent mode where the app's own accent _is_ the album's. Because `usePrimaryRGB` already watches `<html>` inline styles, **all twelve visualizers, every glow and every ring recolor themselves for free** the moment the record changes.

_Why it fits:_ it's the connective tissue that makes #2, #1 and #5 look designed rather than assembled, and it's the cheapest thing on this list per unit of visible change. Quiet, not loud: the accent _eases_ between records, it doesn't snap.

_Builds on:_ `useAmbientColor.tsx` (same Image load, same LRU, same cache key — just a richer value object; keep `DEFAULT_COLOR` as the fallback contract); `useAccentStore.applyAccent()` already writes exactly the four properties needed and already picks a WCAG-safe foreground — the follow-art mode is a third state next to preset/null; `usePrimaryRGB`'s MutationObserver closes the loop; `globals.css` already uses `oklch(from … l c h / …)` relative color syntax, which is the right tool for clamping a wild album color into the calm palette (cap chroma, floor lightness) instead of letting a neon single repaint the app.

_Rust leverage:_ moderate and attractive — the art bytes are already decoded server-side for the LRU, so a `art_palette(hash) -> [Rgb; 5]` command (k-means or median-cut) is a small crate-free addition that kills the renderer's Image+canvas round trip entirely and can be cached alongside the art. Good second-pass optimization, not needed for v1 of the feature.

_Watch out for:_ contrast is the whole risk — every derived color needs the OKLCH clamp _and_ the existing luminance-based foreground pick; monochrome/black covers must degrade to the theme accent rather than to a gray app; the transition between two palettes should be an eased tween, not a swap (see #10).

---

### 5. Lyric Focus — typography as the visual event

**Wow/effort: 4 · Effort: S-M (1.5 days)**

A second presentation for synced lyrics: the active line rendered large and centered in the display serif, the lines around it receding in blur and opacity like they're underwater, each new line rising into focus on the beat of its timestamp. During instrumental gaps of six seconds or more, the lyrics don't sit blank — three dots breathe in the accent color. It turns the quiet middle of a song into a designed moment instead of dead space.

_Why it fits:_ lofi is half-instrumental; the interlude treatment is the part nobody does. And the depth-of-field metaphor is calm by construction — nothing moves fast, the motion is focus, not travel.

_Builds on:_ `LyricsBody` / `LyricsList` / `LyricLineButton` already implement a three-state past/active/idle styling contract with per-state class props threaded from `NowPlayingView`; `useLyricsAppearanceStore` already persists font size + dim opacity per mode, so this is a `lyricsPresentation: 'list' | 'focus'` sibling; `useLyricsView` already computes `activeLine` and handles click-to-seek (keep it — focus mode must stay seekable); Sanctuary Mode (#1) is its natural home.

_Rust leverage:_ none.

_Watch out for:_ keep the accessible name and click-to-seek on every line even when it's blurred to 0.1 opacity — the `LyricLineButton` is a real button and must stay one; `filter: blur()` on text is expensive at scale, so blur a wrapping layer or use opacity+scale under low-perf; plain (unsynced) lyrics must fall back to the list presentation, not to an empty stage.

---

### 6. Now-Playing Poster — one click, one beautiful PNG

**Wow/effort: 4 · Effort: M (2 days)**

Render the current track as a card worth posting: cover, the artwork bloom in the record's own palette, title and artist in the serif italic, the **real waveform** from the peaks cache with the played portion marked, an optional lyric line, a small shiranami mark, and the date. Copy to clipboard or save as a 1080×1350 PNG. A playlist variant uses the existing art collage.

_Why it fits:_ it is the app's only outward-facing visual artifact, and the lyric-card generator cottage industry proves the demand is real and unserved. Every card someone posts is an ad that looks like the product's best screenshot.

_Builds on:_ `useWaveformPeaks` (512 peaks, already disk-cached, already normalized in `WaveformSeekbar.hooks.ts` — the bar-reduction and raster code is directly liftable); `ShareDialog` + `ShareDialogManager` (the dialog surface and its manager pattern already exist — this is a second tab/mode, not a new subsystem); the palette from #4 and the bloom from #2 give the card its look for free; `ArtCollage` for the playlist variant; `dialog_save_file` already exists in `apps/desktop-tauri/src-tauri/src/commands/dialog.rs`.

_Rust leverage:_ small — `dialog_save_file` + writing bytes. Server-side rendering is possible but pointless; the renderer already has the fonts and the peaks.

_Watch out for:_ fonts must be loaded (`document.fonts.ready`) before the offscreen canvas draw or the card ships in a fallback face; cover art at 1080px means requesting the full-size art, not the thumbnail; give it a couple of layouts (square for Instagram, 4:5, and a 16:9 desktop-wallpaper variant) — the wallpaper variant is a sleeper hit; keep the mark small and tasteful, this is not a watermark.

---

### 7. Visualizer as atmosphere — let the 12 visualizers own the whole window

**Wow/effort: 4 · Effort: S (0.5-1 day)**

Add a third placement next to top-docked and bottom-docked: **background**. The chosen visualizer renders full-window behind everything at low opacity, so `constellation` becomes a slow star field under your library and `liquid` becomes a lava lamp behind the queue. Twelve visualizers you already shipped instantly feel like twelve new ambient wallpapers.

_Why it fits:_ the cheapest wow on this list, and the low opacity is what converts "visualizer" into "atmosphere" — the calm framing of work you already own.

_Builds on:_ `VisualizerStrip.hooks.ts` computes placement from `useLayoutStore.visualizerPosition` — this is one more enum member plus a full-bleed `containerStyle`; `visualizerRegistry.ts` is untouched; `useVisualizerFrame` already handles arbitrary canvas sizes and DPR; `useRafLoop`'s IntersectionObserver keeps it honest.

_Rust leverage:_ none.

_Watch out for:_ a full-window canvas at 30fps is a real GPU cost on 4K — clamp the backing store resolution (render at 0.5× and upscale; the visuals are blurry-by-design anyway), and force-disable under `lowPerformanceMode`; contrast is the risk again, so cap opacity low and re-check text over `mountain`/`vu` which have large bright areas; it must compose with #2 and #3 rather than fight them — decide the z-order once and document it.

---

### 8. Tempo-locked breathing — BPM as calm motion (Rung 3, cashed as visuals)

**Wow/effort: 4 · Effort: L (4-5 days)**

Land the third rung of the Rust ladder and spend it on _stillness_: detect each track's tempo natively, publish it as `--beat-duration`, and let every slow layer in the app breathe on it at half or quarter time. The artwork bloom swells once a bar. The mascot's float period locks to the song. The compact player's ring pulses with the record rather than with a hardcoded 3s keyframe. Nothing flashes; the whole room just starts inhaling at the tempo of the music.

_Why it fits:_ it's the anti-rave use of beat detection, and it's the only feature here that a web app fundamentally cannot do as well — it's the Rust backend showing its work. It also completes the user's own three-rung learning ladder (peaks → LUFS → BPM), which is a stated personal goal, and the same number unlocks BPM smart-playlist rules and tempo-continuous mixes, so the cost is shared with the non-visual roadmap.

_Builds on:_ `crates/shiranami-audio/src/sink.rs` — the `PcmSink` seam is documented and **pinned by `crates/shiranami-audio/tests/sink_seam.rs`**, and `lib.rs` explicitly reserves `realfft` for exactly this; `peaks/cache.rs` is the template for a per-track cache keyed on `sha256(path|mtime|size)`; `commands/waveform.rs` is the template for the command + binding; renderer-side it's one CSS custom property feeding keyframes that already exist in `globals.css` (`shiranami-float`, `pulseSubtle`, the compact ring shadow).

_Rust leverage:_ **maximum.** Onset-detection sink → tempo histogram → cached BPM + confidence. Reuses the decoder, the error taxonomy and the cache pattern unchanged.

_Watch out for:_ half/double-time ambiguity is endemic in lofi (a 75 BPM track will read as 150) — store confidence and _refuse to sync_ below a threshold rather than breathing at the wrong rate; the phase problem is harder than the tempo problem, so either derive phase from the live analyser's onset energy or accept a free-running oscillator at the right period; **never** sync anything under `prefers-reduced-motion`; radio streams have no file, so the whole layer must degrade to the current fixed periods.

---

### 9. Desk Companion — a real second window that lives in the corner

**Wow/effort: 3.5 · Effort: M-L (3-3.5 days)**

Not the compact player (which is the main window shrunk, and disappears the moment you want your library back). A genuine second surface: a small rounded translucent panel — cover, palette bloom, one line of marquee, a hairline progress arc, and the mascot dozing in the corner — that snaps to a screen edge, stays on top, and keeps the music present while the main window is closed or buried. Optionally the mascot alone: a tiny companion sitting on your desktop, swaying while music plays, asleep when paused.

_Why it fits:_ it's the "sanctuary is always there" promise made literal, and it's the first time the mascot gets to exist near the music instead of only in empty states.

_Builds on:_ `CompactPlayer.hooks.ts` (marquee, ambient radial, always-on-top toggle, the whole view model is reusable); `apps/desktop-tauri/src-tauri/src/compact.rs` — `valid_compact_position()` and the work-area/multi-display validation are already written **and unit-tested**, which is the fiddly part of any corner-snapping widget; `commands/window.rs` commands are already `tauri::Window`-scoped so they generalize to a second label; `events.rs`'s typed-event macro for cross-window state sync.

_Rust leverage:_ substantial — a second window label in `tauri.conf.json`, transparent+decorationless config, positioner, and a broadcast path so both webviews see the same playback state.

_Watch out for:_ **two webviews means two zustand stores and two `localStorage` readers** — playback state must be pushed over Tauri events from a single owner, and the persisted-store rehydration will otherwise fight itself; the audio graph must stay in exactly one window (the main one) or you get two AudioContexts; transparent windows have known Tauri quirks per platform (tauri#8308, and click-through is still an open request, tauri#13070) — spike this before committing; the CSP and the loopback serve token both need to reach the second webview; a mascot companion needs sprite art that doesn't exist yet, so scope that separately.

---

### 10. Continuity — make the track change a crossfade for the eyes

**Wow/effort: 3 · Effort: S (1 day)**

Right now the art springs and the glow snaps to a new color. Instead, let the _whole room_ change with the music: the bloom cross-dissolves from the outgoing cover to the incoming one over the same window as the audio crossfade, the accent eases hue-to-hue instead of jumping, and the waveform wipes in from the playhead. It's the difference between an app switching tracks and a record being changed.

_Why it fits:_ pure polish, but it's the polish that people describe as "expensive-feeling," and it's what stops #2 and #4 from looking janky when they land.

_Builds on:_ `useAudioEngine.ts`'s dual-deck crossfade (its timing is already unit-tested in `useAudioEngine.fade.test.ts` and `audioAnalyser.ts` exposes per-deck gains) — the visual fade should read the same duration rather than hardcode one; `AmbientBackground`'s existing `bloomKey`/`AnimatePresence` structure already supports overlapping layers; `useAmbientColor` needs a two-color transitional state; `usePrimaryRGB`'s `versionRef` already exists to invalidate cached canvas gradients mid-tween.

_Rust leverage:_ none.

_Watch out for:_ a tween that outlives a rapid skip must be cancelled, not queued (skip five tracks fast and you get five overlapping bloom layers); interpolate in OKLCH, not sRGB, or two saturated covers cross through mud; must be instant under `prefers-reduced-motion`.

---

## Part 3 — Ranking table

| #   | Feature                                         | Wow/effort | Effort       | Rust leverage                                    |
| --- | ----------------------------------------------- | ---------- | ------------ | ------------------------------------------------ |
| 1   | Sanctuary Mode (fullscreen + idle screensaver)  | 5          | M (2.5-3d)   | Medium — `window_set_fullscreen` + sleep inhibit |
| 2   | Artwork Bloom background                        | 5          | S-M (1.5-2d) | Low — optional `?w=` on the art route            |
| 3   | Living Scenes (time-of-day + weather)           | 5          | M (2.5-3d)   | None                                             |
| 4   | Palette theming + follow-art accent             | 4          | S (1-1.5d)   | Medium — optional native palette extraction      |
| 5   | Lyric Focus typography                          | 4          | S-M (1.5d)   | None                                             |
| 6   | Now-Playing Poster export                       | 4          | M (2d)       | Low — `dialog_save_file` exists                  |
| 7   | Visualizer as atmosphere (background placement) | 4          | S (0.5-1d)   | None                                             |
| 8   | Tempo-locked breathing (BPM)                    | 4          | L (4-5d)     | **Maximum** — the Rung 3 seam                    |
| 9   | Desk Companion (second window)                  | 3.5        | M-L (3-3.5d) | Substantial — multi-window                       |
| 10  | Continuity (visual crossfade)                   | 3          | S (1d)       | None                                             |

**Suggested v2 shipping set:** #2 + #4 + #10 first (they're one coherent ~4-day "the app now breathes with your music" chunk and everything else looks better on top of them), then #1 + #5 as the headline (Sanctuary Mode is far more impressive once the bloom and the palette are behind it), then #3 as the identity feature, with #7 as a nearly-free bonus line. #6, #8 and #9 are the second wave.

---

## Part 4 — Top 3, as release notes

> **Sanctuary Mode** — Press F and the app disappears. Just the cover, the lyric, and the light — and if you leave it alone, your desk quietly becomes a lofi display.

> **Artwork Bloom** — Every background is now made of the record you're playing: four ghosts of the cover, blurred into light, drifting slower than you'll notice.

> **Living Scenes** — Your theme now knows what time it is and what the sky is doing. When it rains in your city, it rains on the window.

---

## Part 5 — Anti-recommendations

- **Butterchurn / MilkDrop presets.** A one-afternoon drop-in against the existing `AnalyserNode`, thousands of presets, genuinely impressive — and completely wrong for this product. It is strobing demo-scene maximalism; importing it would make shiranami look like a media player from 2003 wearing a calm skin. If the pull is irresistible, gate it behind a single hidden "chaos" visualizer and never make it default.
- **A 13th hand-written canvas visualizer.** There are twelve. The marginal one adds a settings tile, not a feeling. #7 (placement) makes all twelve feel new for a fraction of the cost.
- **Video/animated album art (Spotify Canvas-style).** No local metadata source supplies it, and fabricating it means either shipping stock loops (generic) or generating video (expensive, and off-identity). #2 gets 80% of the impression from data the user already has.
- **Full WebGL/shader pipeline.** The Apple twist shader is genuinely nicer than CSS blur, but it would be the first shader code in the repo, it breaks the `useVisualizerFrame` Canvas-2D contract every visualizer shares, and WKWebView/WebKitGTK GPU behaviour is one more platform matrix. Revisit only if #2 measurably disappoints.
