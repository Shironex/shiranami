import type { ImageSourcePropType } from 'react-native';
import { hashString } from '@/lib/hash';
import { pickKanji } from '@/lib/kanji';

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

/** Scenes a title can ask for through its kanji; the daylight ones only this way. */
const PHOTO_BY_GLYPH: Partial<Record<string, ThemePhotoName>> = {
  雪: 'snow',
  星: 'snow',
  夕: 'sunset',
  夏: 'summer',
  波: 'summer',
  水: 'summer',
  川: 'summer',
  雲: 'summer',
  風: 'summer',
  桜: 'wisteria',
  花: 'wisteria',
  春: 'wisteria',
  葉: 'wisteria',
  森: 'wisteria',
};

/** Everything else gets a night scene: the app is for listening in the dark. */
const NIGHT_PHOTOS: readonly ThemePhotoName[] = ['lofi-night', 'snow'];

/** A photo plus the point (in percent) a crop centers on. */
export interface PhotoCrop {
  photo: ThemePhotoName;
  x: number;
  y: number;
}

/**
 * A crop of one theme photo for a track without art, stable per title. The
 * scene follows the title's kanji (snow for "Snowfall"), otherwise a night
 * one. Points stay away from the edges, where the photos are mostly frame.
 */
export function pickPhotoCrop(seed: string): PhotoCrop {
  const hash = hashString(seed.toLowerCase());
  const asked = PHOTO_BY_GLYPH[pickKanji(seed).glyph];
  return {
    photo: asked ?? NIGHT_PHOTOS[hash % NIGHT_PHOTOS.length],
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
