import { describe, expect, it } from 'vitest';
import {
  getLegacyWeekStorageKey,
  getMonthCalendarDates,
  getOffsetForDate,
  getWeekStorageKey,
  toLocalDateStr
} from '../src/renderer/dateUtils.js';

describe('dateUtils', () => {
  it('formats local dates without UTC drift', () => {
    const date = new Date(2024, 0, 5);
    expect(toLocalDateStr(date)).toBe('2024-01-05');
  });

  it('uses the same Sunday-start storage key across a displayed week', () => {
    expect(getWeekStorageKey('2026-03-29', 0)).toBe('2026-W14');
    expect(getWeekStorageKey('2026-03-30', 0)).toBe('2026-W14');
    expect(getLegacyWeekStorageKey('2026-03-30', 0)).toBe('2026-W13');
  });

  it('computes offsets from the configured week start', () => {
    expect(getOffsetForDate('2026-03-30', '2026-03-29', 0)).toBe(0);
    expect(getOffsetForDate('2026-04-05', '2026-03-29', 0)).toBe(1);
  });

  it('aligns the month grid to the configured week start', () => {
    const dates = getMonthCalendarDates(2026, 3, 0);
    expect(dates[0]).toBe('2026-03-01');
    expect(dates[6]).toBe('2026-03-07');
  });
});
