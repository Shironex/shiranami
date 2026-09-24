/**
 * A synchronous `window.electronAPI` whose answers come from a module loaded
 * later.
 *
 * The surface has to exist before `@/lib/platform` freezes `IS_ELECTRON`, which
 * is long before a dynamic import can resolve. So this installs a recursive
 * Proxy straight away and defers only the answers: calling any method waits for
 * the fixture module, then calls the same path on it. That keeps the fixtures
 * (a whole demo library) out of every page load that does not ask for them.
 *
 * Three kinds of member cannot wait and are answered here:
 *
 * - data read synchronously at bootstrap (`platform`, `__e2e`, `errors`), passed
 *   in as `sync`;
 * - subscriptions (`onX(callback)`), which must hand back an unsubscribe
 *   function immediately because React cleanups call it synchronously;
 * - feature detection (`if (api.radio.log)`, `typeof api.db.tracks.search`),
 *   which sees every member as present. The fixtures implement the v2 surface,
 *   so present is the truthful answer.
 *
 * A path the fixtures do not implement resolves to `undefined`, as Storybook's
 * mock does, and is logged once so a gap is visible in the console.
 */

type AnyFunction = (...args: unknown[]) => unknown;

/** Loads the fixture surface. Called at most once per page load. */
export type ShowcaseApiLoader = () => Promise<Record<string, unknown>>;

function resolvePath(root: unknown, path: readonly string[]): unknown {
  let node = root;
  for (const key of path) {
    if (node === null || (typeof node !== 'object' && typeof node !== 'function')) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function isSubscription(path: readonly string[], args: unknown[]): boolean {
  const name = path[path.length - 1] ?? '';
  return /^on[A-Z]/.test(name) && typeof args[0] === 'function';
}

export function createLazyApi<T extends object>(
  loader: ShowcaseApiLoader,
  sync: Record<string, unknown>
): T {
  let loaded: Promise<Record<string, unknown>> | null = null;
  const load = () => (loaded ??= loader());
  const reported = new Set<string>();
  const nodes = new Map<string, unknown>();

  const missing = (path: readonly string[]) => {
    const name = path.join('.');
    if (reported.has(name)) return;
    reported.add(name);
    console.warn(`[showcase] electronAPI.${name} has no fixture; answering undefined`);
  };

  const call = (path: readonly string[], args: unknown[]): unknown => {
    if (isSubscription(path, args)) {
      let unsubscribe: unknown;
      let cancelled = false;
      void load().then(api => {
        if (cancelled) return;
        const target = resolvePath(api, path);
        if (typeof target === 'function') unsubscribe = (target as AnyFunction)(...args);
      });
      return () => {
        cancelled = true;
        if (typeof unsubscribe === 'function') (unsubscribe as AnyFunction)();
      };
    }

    return load().then(api => {
      const target = resolvePath(api, path);
      if (typeof target !== 'function') {
        missing(path);
        return undefined;
      }
      return (target as AnyFunction)(...args);
    });
  };

  const node = (path: readonly string[]): unknown => {
    const key = path.join('.');
    const cached = nodes.get(key);
    if (cached) return cached;

    // A function target, so the same node can be called (a method) or drilled
    // into (a namespace): which one it is only shows at the use site.
    const created = new Proxy(function showcaseMember() {}, {
      get(_target, prop) {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        return node([...path, prop]);
      },
      has: (_target, prop) => typeof prop === 'string',
      apply: (_target, _thisArg, args: unknown[]) => call(path, args),
    });
    nodes.set(key, created);
    return created;
  };

  return new Proxy({} as T, {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (Object.prototype.hasOwnProperty.call(sync, prop)) return sync[prop];
      return node([prop]);
    },
    has: (_target, prop) => typeof prop === 'string',
  });
}
