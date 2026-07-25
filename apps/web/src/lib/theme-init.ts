/**
 * Pre-paint theme restore, loaded by index.html as the first module script.
 *
 * The packaged CSP is `script-src 'self'` with no 'unsafe-inline' (see
 * `setupContentSecurityPolicy` in apps/desktop/src/main/app/window.ts), so this
 * cannot live in an inline `<script>`: Chromium refuses to execute it and every
 * packaged build boots on the baseline theme until the theme store rehydrates.
 * A bundled module is served from 'self', which the policy allows.
 *
 * Ordering contract: index.html loads this ahead of `/src/main.tsx`. Deferred
 * module scripts execute in document order, and the production build folds both
 * tags into one entry module whose imports preserve that order — so this body
 * runs before the React entry's, and `<html data-theme>` is set before anything
 * mounts. Keep the module dependency-free: whatever it imports has to be
 * fetched and evaluated before the theme can land.
 */

/** Persist key and default theme owned by `useThemeStore`; inlined to keep this module import-free. */
const THEME_STORE_KEY = 'shiranami.theme';
const DEFAULT_THEME = 'none';

interface PersistedThemeBucket {
  state?: { theme?: unknown };
}

/**
 * Mirror the persisted theme onto `<html data-theme>`. Read-only and
 * defensive: storage access can throw and the bucket is untrusted, so anything
 * missing, corrupt, or non-string leaves the attribute off — which is exactly
 * the `none` baseline. `useThemeStore` re-applies the sanitized value when it
 * rehydrates.
 */
export function applyPersistedTheme(): void {
  try {
    const raw = localStorage.getItem(THEME_STORE_KEY);
    if (raw === null) return;
    const bucket = JSON.parse(raw) as PersistedThemeBucket | null;
    const theme = bucket?.state?.theme;
    if (typeof theme === 'string' && theme !== '' && theme !== DEFAULT_THEME) {
      document.documentElement.dataset.theme = theme;
    }
  } catch {
    /* unreadable storage or a corrupt bucket — keep the baseline theme */
  }
}

applyPersistedTheme();
