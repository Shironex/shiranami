import type { ImageSourcePropType } from 'react-native';
import { hashString } from '@/lib/hash';

export type ThemePhotoName = 'lofi-night' | 'snow' | 'summer' | 'sunset' | 'wisteria';

interface ThemePhotoAsset {
  source: ImageSourcePropType;
  /** Pixel size of the file; crops need the aspect ratio before it loads. */
  width: number;
  height: number;
}

/** The desktop window-seat scenes, copied from apps/web/public/themes. */
export const THEME_PHOTOS: Record<ThemePhotoName, ThemePhotoAsset> = {
  'lofi-night': {
    source: require('../assets/images/themes/lofi-night.webp'),
    width: 1860,
    height: 845,
  },
  snow: { source: require('../assets/images/themes/snow.webp'), width: 1672, height: 941 },
  summer: { source: require('../assets/images/themes/summer.webp'), width: 1672, height: 941 },
  sunset: { source: require('../assets/images/themes/sunset.webp'), width: 1672, height: 941 },
  wisteria: {
    source: require('../assets/images/themes/wisteria.webp'),
    width: 1672,
    height: 941,
  },
};

const PHOTO_NAMES = Object.keys(THEME_PHOTOS) as ThemePhotoName[];

/** A photo plus the point (in percent) a crop centers on. */
export interface PhotoCrop {
  photo: ThemePhotoName;
  x: number;
  y: number;
}

/**
 * A small crop of one theme photo for a track without art, stable per title.
 * Points stay away from the edges, where the photos are mostly frame.
 */
export function pickPhotoCrop(seed: string): PhotoCrop {
  const hash = hashString(seed.toLowerCase());
  return {
    photo: PHOTO_NAMES[hash % PHOTO_NAMES.length],
    x: 12 + ((hash >>> 4) % 77),
    y: 18 + ((hash >>> 12) % 65),
  };
}

export interface CropLayout {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Size and offset of an image so it covers a `boxW` by `boxH` frame, zoomed
 * by `zoom`, with the point (`x`%, `y`%) of the image pulled toward the same
 * point of the frame, like CSS `background-position` with `cover`.
 */
export function coverLayout(
  image: { width: number; height: number },
  boxW: number,
  boxH: number,
  x: number,
  y: number,
  zoom = 1
): CropLayout {
  const scale = Math.max(boxW / image.width, boxH / image.height) * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    width,
    height,
    left: -((width - boxW) * x) / 100,
    top: -((height - boxH) * y) / 100,
  };
}
