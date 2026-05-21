/**
 * Return a new array with the elements of `items` randomly permuted using an
 * unbiased Fisher-Yates shuffle. Does not mutate the input.
 *
 * Replaces the biased `[...arr].sort(() => Math.random() - 0.5)` idiom.
 * `@shiranami/shared` does not currently export a shuffle, so it lives here.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
