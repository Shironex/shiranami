/**
 * Format an EQ gain (dB) for display: rounded to one decimal with an explicit
 * leading '+' for positive values (e.g. 3 -> "+3", -1.5 -> "-1.5", 0 -> "0").
 */
export function formatGain(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}`;
}
