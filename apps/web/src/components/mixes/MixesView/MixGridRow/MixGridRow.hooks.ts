import { createElement, type ImgHTMLAttributes } from 'react';
import type { IMixGridRowProps, IMixGridRowView, MixGridRowArt } from './MixGridRow.types';

/** A full mosaic is a 2x2 grid, so it needs four covers to look intentional. */
const MOSAIC_TILE_COUNT = 4;

function artFor(previewCount: number): MixGridRowArt {
  if (previewCount >= MOSAIC_TILE_COUNT) return 'mosaic';
  if (previewCount > 0) return 'single';
  return 'icon';
}

export function useMixGridRow({ card, countLabel }: IMixGridRowProps): IMixGridRowView {
  // Built here rather than in the shell so the row stays a declarative render.
  // The tiles are decorative — the row's accessible name is its text alone.
  const mosaicTiles = card.previewTracks.slice(0, MOSAIC_TILE_COUNT).map((track, i) =>
    createElement<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>('img', {
      key: i,
      src: track.albumArt,
      alt: '',
      'aria-hidden': 'true',
      loading: 'lazy',
      decoding: 'async',
      className: 'w-full h-full object-cover',
    })
  );

  return {
    icon: card.icon,
    art: artFor(card.previewTracks.length),
    mosaicTiles,
    singleArt: card.previewTracks[0]?.albumArt,
    title: card.title,
    desc: card.desc,
    showCount: card.count > 0,
    countLabel,
    onOpen: card.onOpen,
  };
}
