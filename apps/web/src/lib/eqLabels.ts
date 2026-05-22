export function formatEqFrequencyTick(freq: number): string {
  return freq >= 1000 ? `${freq / 1000}k` : String(freq);
}
