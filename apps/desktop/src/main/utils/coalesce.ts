/**
 * Coalesce concurrent async calls by key: while a call for `key` is in
 * flight, later callers await the same promise instead of starting another.
 * The entry is removed when the promise settles (resolve or reject), so a
 * failure never sticks — the next caller retries fresh.
 */
export function coalesce<T>(
  inflight: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>
): Promise<T> {
  let pending = inflight.get(key);
  if (!pending) {
    pending = factory().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}
