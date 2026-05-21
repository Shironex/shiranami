interface ViewCountLabel {
  /** i18n key in the `search` namespace. */
  key: 'viewsBillion' | 'viewsMillion' | 'viewsThousand' | 'views';
  /** Interpolation count — abbreviated for the >=1k buckets, raw otherwise. */
  count: number | string;
}

/**
 * Pick the i18n key + interpolation count for a YouTube-style view count,
 * abbreviating to B/M/K with one decimal (trailing `.0` stripped). Replaces
 * the 4-level nested ternary that lived inline in SearchView's JSX.
 */
export function formatViewCount(viewCount: number): ViewCountLabel {
  const abbreviate = (value: number) => value.toFixed(1).replace(/\.0$/, '');

  if (viewCount >= 1_000_000_000) {
    return { key: 'viewsBillion', count: abbreviate(viewCount / 1_000_000_000) };
  }
  if (viewCount >= 1_000_000) {
    return { key: 'viewsMillion', count: abbreviate(viewCount / 1_000_000) };
  }
  if (viewCount >= 1_000) {
    return { key: 'viewsThousand', count: abbreviate(viewCount / 1_000) };
  }
  return { key: 'views', count: viewCount };
}
