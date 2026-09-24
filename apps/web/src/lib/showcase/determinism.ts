/**
 * Make every showcase page load render the same pixels: one fixed "now" and one
 * fixed random sequence.
 *
 * Both are patched before any app module evaluates, because the greeting, the
 * clock card, relative dates and the history windows read the time at mount,
 * and shuffles read `Math.random` whenever they like.
 *
 * The clock is frozen, not merely offset. A clock that keeps ticking from a
 * fixed start still rolls the minute over partway through a capture run, and
 * the clock card and "minutes ago" labels would differ between two runs.
 * Nothing in the app waits on `Date.now()` advancing (timers use `setTimeout`,
 * animation uses `performance.now()`), so stopping it is safe.
 */

/**
 * The frozen instant: Friday 12 June 2026, 21:40, in the machine's own time
 * zone. Built from local fields rather than an ISO string so the clock card
 * and the greeting read "21:40, good evening" on any machine.
 */
export const SHOWCASE_NOW = new Date(2026, 5, 12, 21, 40, 0, 0).getTime();

const SHOWCASE_SEED = 0x5eed_2026;

/** A small seeded PRNG (mulberry32): fast, and the same sequence every load. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Replace `Date` with one whose no-argument forms (`new Date()`, `Date.now()`,
 * `Date()`) answer {@link SHOWCASE_NOW}. Every other form is the real `Date`,
 * and instances share its prototype, so `instanceof Date` still holds.
 */
export function freezeClock(target: typeof globalThis = globalThis): void {
  const RealDate = target.Date;
  const construct = RealDate as unknown as new (...args: unknown[]) => Date;

  function ShowcaseDate(this: unknown, ...args: unknown[]): Date | string {
    if (!new.target) return new RealDate(SHOWCASE_NOW).toString();
    if (args.length === 0) return new RealDate(SHOWCASE_NOW);
    return new construct(...args);
  }

  ShowcaseDate.prototype = RealDate.prototype;
  Object.assign(ShowcaseDate, {
    now: () => SHOWCASE_NOW,
    parse: RealDate.parse.bind(RealDate),
    UTC: RealDate.UTC.bind(RealDate),
  });

  target.Date = ShowcaseDate as unknown as DateConstructor;
}

/** Replace `Math.random` with a seeded sequence. */
export function seedRandom(target: typeof globalThis = globalThis): void {
  target.Math.random = seededRandom(SHOWCASE_SEED);
}
