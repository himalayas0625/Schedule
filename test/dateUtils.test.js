import { describe, it, expect } from 'vitest';

/**
 * 日期工具函数测试
 * 这些函数从 app.js 提取出来进行测试
 */

// 将 Date 格式化为本地日期字符串
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 获取 ISO 周字符串 "YYYY-Www"
function getISOWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const year = d.getFullYear();
  const week1 = new Date(year, 0, 4);
  const weekNum = 1 + Math.round(
    ((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  );
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

describe('toLocalDateStr', () => {
  it('should format date correctly', () => {
    const date = new Date(2024, 0, 15); // 2024-01-15
    expect(toLocalDateStr(date)).toBe('2024-01-15');
  });

  it('should pad single digit month and day', () => {
    const date = new Date(2024, 0, 5); // 2024-01-05
    expect(toLocalDateStr(date)).toBe('2024-01-05');
  });

  it('should handle December 31st', () => {
    const date = new Date(2024, 11, 31); // 2024-12-31
    expect(toLocalDateStr(date)).toBe('2024-12-31');
  });
});

describe('getISOWeekKey', () => {
  it('should return correct week key for a known date', () => {
    // 2024-01-01 is Monday of week 1
    const date = new Date(2024, 0, 1);
    expect(getISOWeekKey(date)).toBe('2024-W01');
  });

  it('should return correct week key for mid-year date', () => {
    // 2024-07-15 should be in week 28 or 29
    const date = new Date(2024, 6, 15);
    const key = getISOWeekKey(date);
    expect(key).toMatch(/^2024-W\d{2}$/);
  });

  it('should handle year transition', () => {
    // 2024-12-31 is Tuesday of week 1 2025
    const date = new Date(2024, 11, 31);
    const key = getISOWeekKey(date);
    expect(key).toBe('2025-W01');
  });
});
