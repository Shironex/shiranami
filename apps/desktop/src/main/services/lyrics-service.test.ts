import { describe, it, expect } from 'vitest';
import { parseLrc, buildSearchQueries } from './lyrics-service';

describe('parseLrc', () => {
  it('parses standard [mm:ss.xx] lines', () => {
    const lrc = '[01:23.45]Hello world\n[02:34.56]Second line';
    const result = parseLrc(lrc);
    expect(result).toEqual([
      { time: 83.45, text: 'Hello world' },
      { time: 154.56, text: 'Second line' },
    ]);
  });

  it('parses 3-digit milliseconds', () => {
    const lrc = '[00:05.123]Three digit ms';
    const result = parseLrc(lrc);
    expect(result).toEqual([{ time: 5.123, text: 'Three digit ms' }]);
  });

  it('returns empty array for empty input', () => {
    expect(parseLrc('')).toEqual([]);
  });

  it('skips malformed lines', () => {
    const lrc = 'not a lyric\n[01:00.00]Valid line\n[bad]Also bad';
    const result = parseLrc(lrc);
    expect(result).toEqual([{ time: 60, text: 'Valid line' }]);
  });

  it('sorts lines by time', () => {
    const lrc = '[02:00.00]Second\n[01:00.00]First\n[03:00.00]Third';
    const result = parseLrc(lrc);
    expect(result.map(l => l.text)).toEqual(['First', 'Second', 'Third']);
  });

  it('skips lines with empty text', () => {
    const lrc = '[01:00.00]   \n[02:00.00]Has text';
    const result = parseLrc(lrc);
    expect(result).toEqual([{ time: 120, text: 'Has text' }]);
  });
});

describe('buildSearchQueries', () => {
  it('returns title+artist as first query', () => {
    const queries = buildSearchQueries('Song', 'Artist');
    expect(queries[0]).toBe('Song Artist');
  });

  it('includes title alone as second query', () => {
    const queries = buildSearchQueries('Song', 'Artist');
    expect(queries).toContain('Song');
  });

  it('splits title containing " - "', () => {
    const queries = buildSearchQueries('Artist - Song', 'Other');
    expect(queries).toContain('Artist Song');
    expect(queries).toContain('Song Artist');
  });

  it('deduplicates queries', () => {
    const queries = buildSearchQueries('Song', 'Song');
    const lower = queries.map(q => q.toLowerCase());
    const unique = new Set(lower);
    expect(lower.length).toBe(unique.size);
  });

  it('handles en-dash separator', () => {
    const queries = buildSearchQueries('Artist \u2013 Song', 'Other');
    expect(queries).toContain('Artist Song');
    expect(queries).toContain('Song Artist');
  });
});
