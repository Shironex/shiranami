import { describe, it, expect } from 'vitest';
import { mapWmoCode } from './weather-service';

describe('mapWmoCode', () => {
  it('maps clear sky', () => {
    expect(mapWmoCode(0)).toEqual({ condition: 'clear', label: 'Clear sky' });
  });

  it('maps partly cloudy codes', () => {
    expect(mapWmoCode(1).condition).toBe('partly_cloudy');
    expect(mapWmoCode(2).condition).toBe('partly_cloudy');
  });

  it('maps overcast to cloudy', () => {
    expect(mapWmoCode(3)).toEqual({ condition: 'cloudy', label: 'Overcast' });
  });

  it('maps the rain family', () => {
    for (const code of [51, 61, 63, 65, 80, 82]) {
      expect(mapWmoCode(code).condition).toBe('rain');
    }
  });

  it('maps the snow family', () => {
    for (const code of [71, 73, 75, 77, 85, 86]) {
      expect(mapWmoCode(code).condition).toBe('snow');
    }
  });

  it('maps fog and thunderstorm', () => {
    expect(mapWmoCode(45).condition).toBe('fog');
    expect(mapWmoCode(48).condition).toBe('fog');
    expect(mapWmoCode(95).condition).toBe('thunderstorm');
    expect(mapWmoCode(99).condition).toBe('thunderstorm');
  });

  it('falls back to unknown for unmapped codes', () => {
    expect(mapWmoCode(12345)).toEqual({ condition: 'unknown', label: 'Weather' });
    expect(mapWmoCode(-1).condition).toBe('unknown');
  });
});
