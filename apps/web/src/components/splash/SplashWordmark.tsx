interface SplashWordmarkProps {
  version: string;
}

/**
 * Centered 白波 wordmark + sub-line with version.
 *
 * Sits inside the radial waveform ring — the visual pun of "white waves"
 * surrounded by a waveform is intentional and load-bearing for first-read.
 *
 * CJK fallback is pinned explicitly because Sora lacks full CJK glyph
 * coverage; without it the glyphs fall back to system-ui which may not
 * match the font metrics we size around.
 */
export function SplashWordmark({ version }: SplashWordmarkProps) {
  return (
    <div
      className="flex flex-col items-center gap-1 animate-[shiranami-rise_800ms_cubic-bezier(0.32,0.72,0.24,1.08)_220ms_both]"
      aria-label="白波 Shiranami"
    >
      <span
        className="text-[56px] font-semibold leading-none tracking-[-0.02em] text-foreground select-none"
        style={{
          fontFamily: "'Sora', 'Noto Sans JP', 'Hiragino Sans', system-ui",
        }}
      >
        白波
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground select-none">
        lofi · since 2024 {version ? `· v${version}` : ''}
      </span>
    </div>
  );
}
