import { describe, it, expect } from 'vitest';
import {
  historyRecordPlayArgs,
  historyGetRecentArgs,
  historyGetSummaryArgs,
  historyGetActivityArgs,
  historyGetHourlyActivityArgs,
  historyGetWeeklyInsightsArgs,
} from './db-history';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('db:history payload schemas', () => {
  describe('historyRecordPlayArgs', () => {
    it('accepts a minimal record', () => {
      expect(
        historyRecordPlayArgs.safeParse([{ trackId: UUID, playedSeconds: 120, duration: 240 }])
          .success
      ).toBe(true);
    });

    it('accepts null duration', () => {
      expect(
        historyRecordPlayArgs.safeParse([{ trackId: UUID, playedSeconds: 120, duration: null }])
          .success
      ).toBe(true);
    });

    it('accepts optional source', () => {
      expect(
        historyRecordPlayArgs.safeParse([
          { trackId: UUID, playedSeconds: 120, duration: 240, source: 'radio' },
        ]).success
      ).toBe(true);
    });

    it('rejects non-uuid trackId', () => {
      expect(
        historyRecordPlayArgs.safeParse([{ trackId: 'not-uuid', playedSeconds: 10, duration: 20 }])
          .success
      ).toBe(false);
    });

    it('rejects missing playedSeconds', () => {
      expect(historyRecordPlayArgs.safeParse([{ trackId: UUID, duration: 10 }]).success).toBe(
        false
      );
    });
  });

  describe('historyGetRecentArgs', () => {
    it('accepts zero args (undefined options)', () => {
      expect(historyGetRecentArgs.safeParse([]).success).toBe(true);
    });

    it('accepts an empty options object', () => {
      expect(historyGetRecentArgs.safeParse([{}]).success).toBe(true);
    });

    it('accepts options with limit and since', () => {
      expect(historyGetRecentArgs.safeParse([{ limit: 50, since: '2026-01-01' }]).success).toBe(
        true
      );
    });

    it('accepts null since', () => {
      expect(historyGetRecentArgs.safeParse([{ since: null }]).success).toBe(true);
    });

    it('rejects non-number limit', () => {
      expect(historyGetRecentArgs.safeParse([{ limit: 'ten' }]).success).toBe(false);
    });
  });

  describe('historyGetSummaryArgs / historyGetActivityArgs', () => {
    it('accept zero args', () => {
      expect(historyGetSummaryArgs.safeParse([]).success).toBe(true);
      expect(historyGetActivityArgs.safeParse([]).success).toBe(true);
    });

    it('accept {since: string}', () => {
      expect(historyGetSummaryArgs.safeParse([{ since: '2026-01-01' }]).success).toBe(true);
    });

    it('reject non-string since', () => {
      expect(historyGetSummaryArgs.safeParse([{ since: 123 }]).success).toBe(false);
    });

    it('summary accepts an optional until upper bound', () => {
      expect(
        historyGetSummaryArgs.safeParse([{ since: '2026-01-01', until: '2026-01-08' }]).success
      ).toBe(true);
      expect(historyGetSummaryArgs.safeParse([{ until: null }]).success).toBe(true);
    });
  });

  describe('historyGetHourlyActivityArgs', () => {
    it('accepts zero args and a since window', () => {
      expect(historyGetHourlyActivityArgs.safeParse([]).success).toBe(true);
      expect(historyGetHourlyActivityArgs.safeParse([{ since: '2026-01-01' }]).success).toBe(true);
      expect(historyGetHourlyActivityArgs.safeParse([{ since: null }]).success).toBe(true);
    });
  });

  describe('historyGetWeeklyInsightsArgs', () => {
    it('accepts zero args and a since window', () => {
      expect(historyGetWeeklyInsightsArgs.safeParse([]).success).toBe(true);
      expect(historyGetWeeklyInsightsArgs.safeParse([{ since: '2026-01-01' }]).success).toBe(true);
    });
  });
});
