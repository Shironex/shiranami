import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FastAverageColor } from 'fast-average-color';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAccentStore, applyAccent } from '@/stores/useAccentStore';
import { useUIStore } from '@/stores/useUIStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { startAccentTween } from '@/lib/accentTween';
import { rgbToHex } from '@/lib/color';
import {
  extractPalette,
  artAccentHex,
  artInk,
  ART_SWATCH_ORDER,
  type ArtPalette,
} from '@/lib/artPalette';

const fac = new FastAverageColor();

export interface AmbientColor {
  rgb: string; // e.g. "120, 80, 200"
  hex: string; // e.g. "#7850c8"
  isDark: boolean;
  /** Five-swatch palette extracted from the cover, or null (no/unreadable art). */
  palette: ArtPalette | null;
}

export const DEFAULT_COLOR: AmbientColor = {
  rgb: '59, 130, 246', // blue-500
  hex: '#3b82f6',
  isDark: true,
  palette: null,
};

const AmbientColorContext = createContext<AmbientColor>(DEFAULT_COLOR);

/**
 * Bounded LRU of already-extracted ambient colors keyed on the art URL. Art
 * URLs are content-addressed and immutable, so the same cover always yields
 * the same color — re-decoding the image and re-running the FastAverageColor
 * pixel scan on every track change is pure waste. A cache hit lets us set
 * state synchronously and skip the Image/canvas/FAC pass entirely.
 */
const AMBIENT_CACHE_LIMIT = 100;
const ambientCache = new Map<string, AmbientColor>();

function readCache(url: string): AmbientColor | undefined {
  const hit = ambientCache.get(url);
  if (hit) {
    // Refresh recency: re-insert so the eviction order tracks last use.
    ambientCache.delete(url);
    ambientCache.set(url, hit);
  }
  return hit;
}

function writeCache(url: string, color: AmbientColor): void {
  ambientCache.delete(url);
  ambientCache.set(url, color);
  if (ambientCache.size > AMBIENT_CACHE_LIMIT) {
    const oldest = ambientCache.keys().next().value;
    if (oldest !== undefined) ambientCache.delete(oldest);
  }
}

// The palette needs actual pixels; 32×32 keeps the scan ~1k pixels regardless
// of the source art size. One module-level canvas is reused across covers.
const PALETTE_SAMPLE_SIZE = 32;
let paletteCanvas: HTMLCanvasElement | null = null;

function extractPaletteFromImage(img: HTMLImageElement): ArtPalette | null {
  try {
    paletteCanvas ??= document.createElement('canvas');
    paletteCanvas.width = PALETTE_SAMPLE_SIZE;
    paletteCanvas.height = PALETTE_SAMPLE_SIZE;
    const ctx = paletteCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, PALETTE_SAMPLE_SIZE, PALETTE_SAMPLE_SIZE);
    const data = ctx.getImageData(0, 0, PALETTE_SAMPLE_SIZE, PALETTE_SAMPLE_SIZE).data;
    return extractPalette(data);
  } catch {
    // Tainted canvas / decode failure: the average color still works, the
    // palette features just degrade to their theme fallbacks.
    return null;
  }
}

/**
 * Publish the palette as `--art-1…5` + `--art-ink` inline on <html> so any
 * stylesheet (and the poster/bloom layers) can borrow the record's colors.
 * Cleared when no palette is available so themes fall back cleanly.
 */
function applyArtProperties(palette: ArtPalette | null): void {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  if (!palette) {
    for (let i = 0; i < ART_SWATCH_ORDER.length; i++) style.removeProperty(`--art-${i + 1}`);
    style.removeProperty('--art-ink');
    return;
  }
  ART_SWATCH_ORDER.forEach((name, i) => {
    style.setProperty(`--art-${i + 1}`, palette[name].hex);
  });
  style.setProperty('--art-ink', artInk(palette));
}

/**
 * The accent currently painted on <html>, resolved through the cascade so an
 * inline override and a bare theme accent both answer. Null when the triplet
 * cannot be read (jsdom, boot races) — callers then skip the ease and snap.
 */
function currentAppliedAccentHex(): string | null {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return null;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary-rgb').trim();
  const parts = raw.split(',').map(p => Number(p.trim()));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return rgbToHex({ r: parts[0], g: parts[1], b: parts[2] });
}

/** The visual fade window, matched to the audio crossfade when it is on. */
function visualFadeMs(): number {
  const { crossfadeEnabled, crossfadeDuration } = usePlaybackStore.getState();
  return crossfadeEnabled ? crossfadeDuration * 1000 : 1200;
}

export function AmbientColorProvider({ children }: { children: ReactNode }) {
  const albumArt = usePlaybackStore(s => s.currentTrack?.albumArt);
  const followArtAccent = useAccentStore(s => s.followArtAccent);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const reducedMotion = useReducedMotion();
  const [color, setColor] = useState<AmbientColor>(DEFAULT_COLOR);

  useEffect(() => {
    // Low-performance mode skips the whole extraction pass (image decode,
    // FastAverageColor scan, palette canvas) — even on a cache hit, so no
    // `--art-*` tokens are published. Everything degrades to the no-palette
    // path: the tokens fall back to their neutral theme defaults and
    // follow-art-accent quietly yields the user's stored/preset accent, the
    // same way a monochrome sleeve (null palette) already does.
    if (!albumArt || lowPerformanceMode) {
      setColor(DEFAULT_COLOR);
      return;
    }

    const cached = readCache(albumArt);
    if (cached) {
      setColor(cached);
      return;
    }

    let cancelled = false;

    const img = new Image();
    // Required for getImageData / FastAverageColor: without crossOrigin the
    // canvas the image is drawn onto is tainted and pixel reads SecurityError.
    // The loopback art route answers with `Access-Control-Allow-Origin: *`
    // (§2.4), so the cover loads and the canvas stays readable.
    img.crossOrigin = 'anonymous';
    img.src = albumArt;

    img.onload = () => {
      if (cancelled) return;
      try {
        const result = fac.getColor(img);
        const next: AmbientColor = {
          rgb: `${result.value[0]}, ${result.value[1]}, ${result.value[2]}`,
          hex: result.hex,
          isDark: result.isDark,
          palette: extractPaletteFromImage(img),
        };
        writeCache(albumArt, next);
        setColor(next);
      } catch {
        setColor(DEFAULT_COLOR);
      }
    };

    img.onerror = () => {
      if (cancelled) return;
      setColor(DEFAULT_COLOR);
    };

    return () => {
      cancelled = true;
    };
  }, [albumArt, lowPerformanceMode]);

  // Keep the `--art-*` custom properties in step with the extracted palette.
  useEffect(() => {
    applyArtProperties(color.palette);
    return () => applyArtProperties(null);
  }, [color]);

  // "Follow the record": while enabled, the app's accent is the cover's
  // clamped vibrant swatch — written through the same four custom properties
  // as a manual accent, which is what recolors every canvas visualizer via
  // usePrimaryRGB's MutationObserver. Monochrome covers (null) degrade to the
  // user's stored accent rather than graying the app. On a track change the
  // accent *eases* hue-to-hue in OKLCH over the audio-fade window instead of
  // snapping (instant under reduced motion); starting a new ease cancels the
  // running one so a rapid skip never queues tweens.
  useEffect(() => {
    if (!followArtAccent) return;
    const target = artAccentHex(color.palette) ?? useAccentStore.getState().accentColor;
    let cancelTween = () => {};
    const from = target !== null ? currentAppliedAccentHex() : null;
    if (target !== null && from !== null) {
      cancelTween = startAccentTween(from, target, reducedMotion ? 0 : visualFadeMs(), applyAccent);
    } else {
      applyAccent(target);
    }
    return () => {
      cancelTween();
      applyAccent(useAccentStore.getState().accentColor);
    };
  }, [followArtAccent, color, reducedMotion]);

  return <AmbientColorContext.Provider value={color}>{children}</AmbientColorContext.Provider>;
}

export function useAmbientColor(): AmbientColor {
  return useContext(AmbientColorContext);
}
