/**
 * Shared domain types for the player stores.
 *
 * The renderer's `Track` is the canonical `DisplayTrack` from
 * `@shiranami/contracts` — the display-shaped projection of the DB-mirror
 * `Track` (nulls collapsed at the `trackMapper` boundary). It's re-exported
 * here under the `Track` name every store/component already imports, so the
 * shape lives in one place (contracts) without churning ~118 call sites.
 */

import type { DisplayTrack } from '@shiranami/contracts';

export type Track = DisplayTrack;

export type RepeatMode = 'off' | 'all' | 'one';
