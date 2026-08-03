import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FastAverageColor } from 'fast-average-color';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAccentStore, applyAccent } from '@/stores/useAccentStore';
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

export function AmbientColorProvider({ children }: { children: ReactNode }) {
  const albumArt = usePlaybackStore(s => s.currentTrack?.albumArt);
  const followArtAccent = useAccentStore(s => s.followArtAccent);
  const [color, setColor] = useState<AmbientColor>(DEFAULT_COLOR);

  useEffect(() => {
    if (!albumArt) {
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
  }, [albumArt]);

  // Keep the `--art-*` custom properties in step with the extracted palette.
  useEffect(() => {
    applyArtProperties(color.palette);
    return () => applyArtProperties(null);
  }, [color]);

  // "Follow the record": while enabled, the app's accent is the cover's
  // clamped vibrant swatch — written through the same four custom properties
  // as a manual accent, which is what recolors every canvas visualizer via
  // usePrimaryRGB's MutationObserver. Monochrome covers (null) degrade to the
  // user's stored accent rather than graying the app.
  useEffect(() => {
    if (!followArtAccent) return;
    applyAccent(artAccentHex(color.palette) ?? useAccentStore.getState().accentColor);
    return () => {
      applyAccent(useAccentStore.getState().accentColor);
    };
  }, [followArtAccent, color]);

  return <AmbientColorContext.Provider value={color}>{children}</AmbientColorContext.Provider>;
}

export function useAmbientColor(): AmbientColor {
  return useContext(AmbientColorContext);
}
