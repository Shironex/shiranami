import { afterEach, describe, it, expect } from 'vitest';
import {
  availableFields,
  availableOperatorsFor,
  defaultOperatorFor,
  FIELD_OPERATORS,
  SMART_PLAYLIST_FIELDS,
  supportsResultShaping,
  valueKindFor,
} from './smart-playlist-fields';

/** The global the Tauri webview injects before any page script runs. */
const TAURI_GLOBAL = '__TAURI_INTERNALS__';

/** Pretend this bundle is running inside the Tauri webview. */
function inTauri(): void {
  Object.defineProperty(window, TAURI_GLOBAL, { value: {}, configurable: true });
}

describe('smart-playlist-fields', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, TAURI_GLOBAL);
  });

  it('exposes every field with at least one operator', () => {
    expect(SMART_PLAYLIST_FIELDS.length).toBeGreaterThan(0);
    for (const field of SMART_PLAYLIST_FIELDS) {
      expect(FIELD_OPERATORS[field].length).toBeGreaterThan(0);
    }
  });

  it('defaults to the first supported operator for a field', () => {
    inTauri();

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
    // musicalKey is a stored key name ("C major"), not a measurement.
    expect(valueKindFor('musicalKey', 'is')).toBe('text');
  });

  describe('the runtime capability gate', () => {
    it('hides every field the v1 evaluator drops on a build without it', () => {
      const fields = availableFields();

      // `ruleToCondition` has no case for any of these, so its `default`
      // returns null, the rule is dropped, and a definition made only of
      // dropped rules selects the entire library.
      for (const hidden of ['lastPlayed', 'bpm', 'duration', 'loudnessLufs', 'musicalKey']) {
        expect(fields).not.toContain(hidden);
      }
      // Everything v1 has a case for stays offered.
      expect(fields).toEqual([
        'genre',
        'artist',
        'album',
        'title',
        'year',
        'playCount',
        'isFavorite',
        'dateAdded',
      ]);
    });

    it('offers every field where the whole vocabulary is evaluated', () => {
      inTauri();

      expect(availableFields()).toEqual(SMART_PLAYLIST_FIELDS);
    });

    it('narrows dateAdded to the one operator v1 answers', () => {
      // v1's `dateAdded` case returns null for anything but `inLastDays`, so
      // offering the negation there would widen the playlist, not narrow it.
      expect(availableOperatorsFor('dateAdded')).toEqual(['inLastDays']);
      expect(defaultOperatorFor('dateAdded')).toBe('inLastDays');

      inTauri();

      expect(availableOperatorsFor('dateAdded')).toEqual(['inLastDays', 'notInLastDays']);
    });

    it('leaves the operators of a shared field alone', () => {
      expect(availableOperatorsFor('genre')).toEqual(FIELD_OPERATORS.genre);
      expect(availableOperatorsFor('year')).toEqual(FIELD_OPERATORS.year);
    });

    it('offers the sort and limit row only where the backend honours it', () => {
      // v1's create/update input schema has neither key, so both are stripped
      // on the way in and a "top 25" silently returns every match.
      expect(supportsResultShaping()).toBe(false);

      inTauri();

      expect(supportsResultShaping()).toBe(true);
    });

    it('never offers an operator the full vocabulary does not have', () => {
      // The narrow table is a subset of the wide one by construction; a typo
      // that made it a superset would put an unevaluable operator in the
      // picker on *both* builds.
      for (const field of SMART_PLAYLIST_FIELDS) {
        for (const operator of availableOperatorsFor(field)) {
          expect(FIELD_OPERATORS[field]).toContain(operator);
        }
      }
    });
  });
});
