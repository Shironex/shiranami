import { useEffect, useState } from 'react';
import { FastAverageColor } from 'fast-average-color';
import { usePlayerStore } from '@/stores/usePlayerStore';

const fac = new FastAverageColor();

export interface AmbientColor {
  rgb: string; // e.g. "120, 80, 200"
  hex: string; // e.g. "#7850c8"
  isDark: boolean;
}

const DEFAULT_COLOR: AmbientColor = {
  rgb: '59, 130, 246', // blue-500
  hex: '#3b82f6',
  isDark: true,
};

export function useAmbientColor(): AmbientColor {
  const albumArt = usePlayerStore(s => s.currentTrack?.albumArt);
  const [color, setColor] = useState<AmbientColor>(DEFAULT_COLOR);

  useEffect(() => {
    if (!albumArt) {
      setColor(DEFAULT_COLOR);
      return;
    }

    const img = new Image();
    // Only set crossOrigin for http(s) URLs — custom protocols don't need it
    // and setting it can cause loading issues with protocol handlers
    if (albumArt.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = albumArt;

    img.onload = () => {
      try {
        const result = fac.getColor(img);
        setColor({
          rgb: `${result.value[0]}, ${result.value[1]}, ${result.value[2]}`,
          hex: result.hex,
          isDark: result.isDark,
        });
      } catch {
        setColor(DEFAULT_COLOR);
      }
    };

    img.onerror = () => {
      setColor(DEFAULT_COLOR);
    };
  }, [albumArt]);

  return color;
}
