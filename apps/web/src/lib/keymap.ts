import { IS_MAC } from '@/lib/platform';

/**
 * Keymap model shared by the keyboard handler, the settings rebinding UI and
 * the shortcuts help dialog. A binding is a single chord: an optional primary
 * modifier ("mod" — matched as metaKey OR ctrlKey, exactly like the legacy
 * hardcoded handler), an optional Shift, and one normalized key.
 *
 * Two invariants keep the matcher faithful to the legacy switch statement:
 *
 * - Shift is only significant together with `mod`. The legacy single-key
 *   section matched `switch (e.key)` with both letter cases listed, so Shift
 *   was always transparent there (Shift+M muted, Shift+Space toggled play).
 *   Non-mod bindings therefore never carry `shift: true` and match
 *   regardless of the event's Shift state.
 * - The seek actions read `e.shiftKey` at dispatch time to pick the step
 *   (5s vs 10s), so their bindings wildcard Shift even with `mod` held.
 *
 * Alt/Option is intentionally unsupported: the legacy handler never checked
 * `altKey` (matching stays alt-transparent for parity), and on macOS
 * Option+letter produces a different character in `e.key`, which would make
 * captured chords layout-dependent.
 */

export interface KeyBinding {
  /**
   * Normalized `KeyboardEvent.key`: single characters lowercased, a plain
   * space stored as `'Space'`; named keys (`ArrowLeft`, `F1`, …) verbatim.
   */
  readonly key: string;
  /** Requires ⌘ (macOS) / Ctrl — matched as `metaKey || ctrlKey`. */
  readonly mod: boolean;
  /** Requires Shift. Only meaningful alongside `mod` (see module doc). */
  readonly shift: boolean;
}

/** Every remappable action, in the display order of the settings section. */
export const SHORTCUT_ACTION_IDS = [
  // Playback
  'playPause',
  'nextTrack',
  'previousTrack',
  'seekBack',
  'seekForward',
  'volumeUp',
  'volumeDown',
  'muteUnmute',
  'toggleShuffle',
  'cycleRepeat',
  'favoriteTrack',
  // Panels & UI
  'toggleSidebar',
  'toggleLyrics',
  'toggleQueue',
  'compactMode',
  'toggleAlwaysOnTop',
  'toggleNowPlaying',
  'toggleVisualizer',
  'toggleSanctuary',
  'showHelp',
] as const;

export type ShortcutActionId = (typeof SHORTCUT_ACTION_IDS)[number];

/**
 * Actions whose handler reads `e.shiftKey` to choose a seek step. Their
 * bindings match with or without Shift, so Shift+chord stays reachable as the
 * "big step" variant of the same action.
 */
export const SHIFT_STEP_ACTIONS: ReadonlySet<ShortcutActionId> = new Set([
  'seekBack',
  'seekForward',
]);

/** Defaults — a 1:1 transcription of the legacy hardcoded handler. */
export const DEFAULT_KEYMAP: Record<ShortcutActionId, KeyBinding> = {
  playPause: { key: 'Space', mod: false, shift: false },
  nextTrack: { key: 'n', mod: false, shift: false },
  previousTrack: { key: 'p', mod: false, shift: false },
  seekBack: { key: 'ArrowLeft', mod: false, shift: false },
  seekForward: { key: 'ArrowRight', mod: false, shift: false },
  volumeUp: { key: 'ArrowUp', mod: false, shift: false },
  volumeDown: { key: 'ArrowDown', mod: false, shift: false },
  muteUnmute: { key: 'm', mod: false, shift: false },
  toggleShuffle: { key: 's', mod: false, shift: false },
  cycleRepeat: { key: 'r', mod: false, shift: false },
  favoriteTrack: { key: 'l', mod: false, shift: false },
  toggleSidebar: { key: 'b', mod: true, shift: false },
  toggleLyrics: { key: 'l', mod: true, shift: false },
  toggleQueue: { key: 'q', mod: true, shift: false },
  compactMode: { key: 'm', mod: true, shift: true },
  toggleAlwaysOnTop: { key: 't', mod: true, shift: true },
  toggleNowPlaying: { key: 'p', mod: true, shift: true },
  toggleVisualizer: { key: 'v', mod: false, shift: false },
  toggleSanctuary: { key: 'f', mod: false, shift: false },
  showHelp: { key: '?', mod: false, shift: false },
};

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Meta', 'Alt', 'AltGraph', 'CapsLock', 'Fn']);

/** Normalize a raw `KeyboardEvent.key` into the stored binding form. */
export function normalizeEventKey(key: string): string {
  if (key === ' ') return 'Space';
  return key.length === 1 ? key.toLowerCase() : key;
}

/** True when the event carries a real key (not a bare modifier press). */
export function isBindableEvent(e: KeyboardEvent): boolean {
  return !MODIFIER_KEYS.has(e.key);
}

/**
 * Read the chord a keydown event represents, in binding form. Shift is
 * folded away for non-mod chords (see module doc).
 */
export function chordFromEvent(e: KeyboardEvent): KeyBinding {
  const mod = e.metaKey || e.ctrlKey;
  return {
    key: normalizeEventKey(e.key),
    mod,
    shift: mod && e.shiftKey,
  };
}

/** Structural equality of two bindings. */
export function bindingEquals(a: KeyBinding, b: KeyBinding): boolean {
  return a.key === b.key && a.mod === b.mod && a.shift === b.shift;
}

/**
 * Does a keydown event trigger `binding` for `actionId`? Shift is compared
 * only for mod-chords, and wildcarded for the seek-step actions; Alt is
 * always transparent (legacy parity).
 */
export function bindingMatchesEvent(
  binding: KeyBinding,
  actionId: ShortcutActionId,
  e: KeyboardEvent
): boolean {
  if (binding.key !== normalizeEventKey(e.key)) return false;
  if (binding.mod !== (e.metaKey || e.ctrlKey)) return false;
  if (!binding.mod) return true;
  if (SHIFT_STEP_ACTIONS.has(actionId)) return true;
  return binding.shift === e.shiftKey;
}

/**
 * Would two bindings ever fire on the same keydown? Mirrors
 * `bindingMatchesEvent`: non-mod chords are Shift-transparent, and a
 * seek-step action wildcards Shift on its chord.
 */
export function bindingsCollide(
  a: KeyBinding,
  aId: ShortcutActionId,
  b: KeyBinding,
  bId: ShortcutActionId
): boolean {
  if (a.key !== b.key || a.mod !== b.mod) return false;
  if (!a.mod) return true;
  if (SHIFT_STEP_ACTIONS.has(aId) || SHIFT_STEP_ACTIONS.has(bId)) return true;
  return a.shift === b.shift;
}

export type ReservedChordKind = 'navigation' | 'system';

/**
 * Chords the keymap must never claim: Escape (the universal back/close key),
 * the plain digit row (fixed view navigation), Mod+K (command palette) and
 * Mod+A (select-all guard).
 */
export function findReservedChord(binding: KeyBinding): ReservedChordKind | null {
  if (binding.key === 'Escape') return 'system';
  if (!binding.mod && /^[1-9]$/.test(binding.key)) return 'navigation';
  if (binding.mod && !binding.shift && (binding.key === 'k' || binding.key === 'a')) {
    return 'system';
  }
  return null;
}

export interface BindingConflict {
  readonly type: 'action' | 'reserved';
  /** The colliding action when `type === 'action'`. */
  readonly actionId?: ShortcutActionId;
  /** What the chord is reserved for when `type === 'reserved'`. */
  readonly reservedKind?: ReservedChordKind;
}

/**
 * Check a candidate binding for `actionId` against the reserved chords and
 * every other action's current binding. Returns `null` when it is free.
 */
export function findBindingConflict(
  binding: KeyBinding,
  actionId: ShortcutActionId,
  bindings: Record<ShortcutActionId, KeyBinding>
): BindingConflict | null {
  const reservedKind = findReservedChord(binding);
  if (reservedKind) return { type: 'reserved', reservedKind };
  for (const otherId of SHORTCUT_ACTION_IDS) {
    if (otherId === actionId) continue;
    if (bindingsCollide(binding, actionId, bindings[otherId], otherId)) {
      return { type: 'action', actionId: otherId };
    }
  }
  return null;
}

const KEY_GLYPHS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
};

/** Display label for the primary modifier on this platform. */
export const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';

/** Display label for a stored key (`'m'` → `'M'`, `'ArrowLeft'` → `'←'`). */
export function formatBindingKey(key: string): string {
  const glyph = KEY_GLYPHS[key];
  if (glyph) return glyph;
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * Platform-aware chord labels in display order (`['⌘', 'Shift', 'M']`),
 * matching the convention the shortcuts help dialog established.
 */
export function formatBinding(binding: KeyBinding): string[] {
  const keys: string[] = [];
  if (binding.mod) keys.push(MOD_LABEL);
  if (binding.shift) keys.push('Shift');
  keys.push(formatBindingKey(binding.key));
  return keys;
}

/**
 * Validate an untrusted persisted value into a well-formed binding, enforcing
 * the Shift-only-with-mod invariant. Returns `null` for malformed input.
 */
export function sanitizeBinding(value: unknown): KeyBinding | null {
  if (!value || typeof value !== 'object') return null;
  const { key, mod, shift } = value as Record<string, unknown>;
  if (typeof key !== 'string' || key.length === 0) return null;
  if (typeof mod !== 'boolean' || typeof shift !== 'boolean') return null;
  if (MODIFIER_KEYS.has(key)) return null;
  const normalized = normalizeEventKey(key);
  return { key: normalized, mod, shift: mod && shift };
}
