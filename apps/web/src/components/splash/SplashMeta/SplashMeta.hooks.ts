import type { ISplashMetaProps, ISplashMetaView } from './SplashMeta.types';

/** Fixed brand string — a logotype glyph, deliberately not translated. */
const BRAND_KANJI = '白波';

/**
 * SplashMeta is presentational; the hook forwards the clock and composes the
 * build label, which drops the `v` prefix entirely while the version query is
 * still in flight so the corner never flashes a bare `v`.
 */
export function useSplashMeta({ version, clock }: ISplashMetaProps): ISplashMetaView {
  return {
    buildLabel: version ? `v${version} · ${BRAND_KANJI}` : BRAND_KANJI,
    clock,
  };
}
