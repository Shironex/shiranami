import * as path from 'path';

/**
 * Normalize an absolute path into a comparable form:
 *   - `path.resolve` collapses `..` segments and normalizes separators.
 *   - On case-insensitive filesystems (darwin, win32) the result is lowercased
 *     so that `/Users/Me/Music/song.mp3` and `/users/me/music/song.mp3` compare
 *     equal.
 *   - A trailing path separator is stripped unless the result is a filesystem
 *     root (`/`, `C:\\`, etc.) — this keeps `/foo/bar/` and `/foo/bar`
 *     interchangeable without mangling roots.
 *
 * Does NOT touch the filesystem — no `fs.realpath` call. See `isPathWithin`
 * for the symlink caveat.
 */
export function normalizePathForCompare(p: string): string {
  let resolved = path.resolve(p);
  if (process.platform === 'darwin' || process.platform === 'win32') {
    resolved = resolved.toLowerCase();
  }

  const root = path.parse(resolved).root;
  if (resolved !== root && (resolved.endsWith('/') || resolved.endsWith('\\'))) {
    resolved = resolved.slice(0, -1);
  }

  return resolved;
}

/**
 * Return `true` when `child` is equal to or nested beneath `root`.
 *
 * Both inputs must already be normalized via `normalizePathForCompare`.
 * Matching rules:
 *   - Paths on different filesystem roots (e.g. `C:\\foo` vs `D:\\foo`) are
 *     rejected immediately via `path.parse(...).root` comparison.
 *   - `path.relative(root, child)` is used to detect traversal. A relative
 *     path starting with `..` or that is itself absolute means the child
 *     escapes the root; both are rejected.
 *   - `child === root` is allowed (relative is empty string).
 *
 * IMPORTANT — symlink caveat:
 *   This helper does NOT resolve symlinks. A symlink inside an allowed root
 *   whose target lives outside will be treated as contained. Callers needing
 *   symlink-aware checks must call `fs.realpath` themselves before passing
 *   paths in. We make this trade-off because the audio protocol handler may
 *   service hundreds of Range requests per track, and a per-request stat is
 *   too expensive. Roots are resolved once at cache build time elsewhere.
 */
export function isPathWithin(child: string, root: string): boolean {
  if (path.parse(child).root !== path.parse(root).root) {
    return false;
  }

  const relative = path.relative(root, child);
  if (relative === '') return true;
  if (relative.startsWith('..')) return false;
  if (path.isAbsolute(relative)) return false;
  return true;
}

/**
 * Convenience wrapper: return `true` when `child` is contained within any of
 * the supplied `roots`. `child` is normalized once; `roots` must already be
 * normalized. Iteration short-circuits on the first hit.
 */
export function isPathWithinAny(child: string, roots: readonly string[]): boolean {
  const normalizedChild = normalizePathForCompare(child);
  for (const root of roots) {
    if (isPathWithin(normalizedChild, root)) return true;
  }
  return false;
}
