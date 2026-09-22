/**
 * Display formatting for the analysis engine's tempo and key estimates.
 *
 * BPM renders as a rounded integer behind an approximation sign ("≈ 82 BPM")
 * because the detector estimates rather than measures. The key renders in the
 * stored musical convention ("C major" / "A minor") — the exact name format
 * the analyzer persists — in every locale, the way note names conventionally
 * stay latin.
 */
export function formatTempoKeyLine(
  bpm: number | null | undefined,
  musicalKey: string | null | undefined
): string | null {
  const parts: string[] = [];
  if (bpm != null && Number.isFinite(bpm) && bpm > 0) {
    parts.push(`≈ ${Math.round(bpm)} BPM`);
  }
  if (musicalKey != null && musicalKey !== '') {
    parts.push(musicalKey);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
