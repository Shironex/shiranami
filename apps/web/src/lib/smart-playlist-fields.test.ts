import { describe, it, expect } from 'vitest';
import {
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
    // dateAdded is the only field restricted to inLastDays in the backend.
    expect(FIELD_OPERATORS.dateAdded).toEqual(['inLastDays']);
    // text fields never expose numeric comparisons.
    expect(FIELD_OPERATORS.title).not.toContain('greaterThan');
  });
});
