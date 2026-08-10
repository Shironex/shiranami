import { afterEach, describe, it, expect } from 'vitest';
import {
  availableFields,
  defaultOperatorFor,
  FIELD_OPERATORS,
  SMART_PLAYLIST_FIELDS,
  valueKindFor,
} from './smart-playlist-fields';

describe('smart-playlist-fields', () => {
  it('exposes every field with at least one operator', () => {
    expect(SMART_PLAYLIST_FIELDS.length).toBeGreaterThan(0);
    for (const field of SMART_PLAYLIST_FIELDS) {
      expect(FIELD_OPERATORS[field].length).toBeGreaterThan(0);
    }
  });

  it('defaults to the first supported operator for a field', () => {
    expect(defaultOperatorFor('genre')).toBe('is');
    expect(defaultOperatorFor('dateAdded')).toBe('inLastDays');
  });

  it('maps boolean, days, range, number and text value kinds', () => {
    expect(valueKindFor('isFavorite', 'is')).toBe('boolean');
    expect(valueKindFor('dateAdded', 'inLastDays')).toBe('days');
    expect(valueKindFor('year', 'between')).toBe('range');
    expect(valueKindFor('playCount', 'greaterThan')).toBe('number');
    expect(valueKindFor('artist', 'contains')).toBe('text');
  });

  it('only lists operators the backend translator handles', () => {
    // The two day-count fields take those operators and nothing else.
    expect(FIELD_OPERATORS.dateAdded).toEqual(['inLastDays', 'notInLastDays']);
    expect(FIELD_OPERATORS.lastPlayed).toEqual(['inLastDays', 'notInLastDays']);
    // text fields never expose numeric comparisons.
    expect(FIELD_OPERATORS.title).not.toContain('greaterThan');
    // …and the numeric ones never expose the day-count or substring operators.
    for (const field of ['bpm', 'duration', 'loudnessLufs'] as const) {
      expect(FIELD_OPERATORS[field]).not.toContain('contains');
      expect(FIELD_OPERATORS[field]).not.toContain('inLastDays');
    }
  });

  it('treats lastPlayed as a day count and the analysis fields as numbers', () => {
    expect(valueKindFor('lastPlayed', 'notInLastDays')).toBe('days');
    expect(valueKindFor('bpm', 'greaterThan')).toBe('number');
    expect(valueKindFor('duration', 'between')).toBe('range');
    expect(valueKindFor('loudnessLufs', 'lessThan')).toBe('number');
    // musicalKey is a stored string, not a measurement.
    expect(valueKindFor('musicalKey', 'is')).toBe('text');
  });

  describe('availableFields', () => {
    /** The global the Tauri webview injects before any page script runs. */
    const TAURI_GLOBAL = '__TAURI_INTERNALS__';

    afterEach(() => {
      delete (window as Record<string, unknown>)[TAURI_GLOBAL];
    });

    it('hides the v2-only analysis fields on a build without those columns', () => {
      const fields = availableFields();

      expect(fields).not.toContain('bpm');
      expect(fields).not.toContain('musicalKey');
      // Everything backed by a column both schemas have stays offered.
      expect(fields).toContain('lastPlayed');
      expect(fields).toContain('duration');
      expect(fields).toContain('loudnessLufs');
    });

    it('offers every field where the analysis columns exist', () => {
      (window as Record<string, unknown>)[TAURI_GLOBAL] = {};

      expect(availableFields()).toEqual(SMART_PLAYLIST_FIELDS);
    });
  });
});
