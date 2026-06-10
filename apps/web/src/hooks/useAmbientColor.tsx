import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FastAverageColor } from 'fast-average-color';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

const fac = new FastAverageColor();

export interface AmbientColor {
  rgb: string; // e.g. "120, 80, 200"
  hex: string; // e.g. "#7850c8"
  isDark: boolean;
}

export const DEFAULT_COLOR: AmbientColor = {
  rgb: '59, 130, 246', // blue-500
  hex: '#3b82f6',
  isDark: true,
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

export function AmbientColorProvider({ children }: { children: ReactNode }) {
  const albumArt = usePlaybackStore(s => s.currentTrack?.albumArt);
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
    // shiranami-art:// is registered with corsEnabled, so the protocol handler
    // serves the cover with permissive CORS headers and the load succeeds.
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

  return <AmbientColorContext.Provider value={color}>{children}</AmbientColorContext.Provider>;
}

export function useAmbientColor(): AmbientColor {
  return useContext(AmbientColorContext);
}
