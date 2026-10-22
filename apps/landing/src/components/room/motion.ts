// What the viewer allows: reduced motion and a fine pointer (mouse or pen).
// The page goes static under reduced motion before the room ever loads, but
// the setting can change while the room runs, so the room reads it live.
// No three.js imports: the page scripts read this too.

const query = (q: string) =>
  typeof matchMedia === 'function' ? matchMedia(q) : ({ matches: false } as MediaQueryList);

const reduced = query('(prefers-reduced-motion: reduce)');
const fine = query('(hover: hover) and (pointer: fine)');

export const motion = {
  /** True when the viewer asked for reduced motion. */
  get reduced() {
    return reduced.matches;
  },
  /** True on a desktop pointer; false on touch. */
  get finePointer() {
    return fine.matches;
  },
};
