import { describe, it, expect } from 'vitest';
import { canPlace, slotIndex } from '../src/renderer/collision.js';

describe('slotIndex', () => {
  it('converts HH:MM label to 0..47 slot index', () => {
    expect(slotIndex('00:00')).toBe(0);
    expect(slotIndex('00:30')).toBe(1);
    expect(slotIndex('09:00')).toBe(18);
    expect(slotIndex('23:30')).toBe(47);
  });
});

describe('canPlace', () => {
  it('allows placing in an empty day', () => {
    expect(canPlace({}, '09:00', 1)).toBe(true);
    expect(canPlace({}, '09:00', 4)).toBe(true);
  });

  it('rejects overflow beyond 23:30', () => {
    expect(canPlace({}, '23:30', 1)).toBe(true);
    expect(canPlace({}, '23:30', 2)).toBe(false);
    expect(canPlace({}, '23:00', 2)).toBe(true);
    expect(canPlace({}, '23:00', 3)).toBe(false);
  });

  it('allows a second short event in the same slot', () => {
    const day = { '09:00': [{ text: 'a', colorType: 0 }] };
    expect(canPlace(day, '09:00', 1)).toBe(true);
  });

  it('rejects a third short event in the same slot', () => {
    const day = { '09:00': [{ text: 'a' }, { text: 'b' }] };
    expect(canPlace(day, '09:00', 1)).toBe(false);
  });

  it('rejects a short event landing inside a long event span', () => {
    const day = { '09:00': [{ text: 'a', duration: 2 }] }; // 占 09:00, 09:30
    expect(canPlace(day, '09:30', 1)).toBe(false);
    expect(canPlace(day, '10:00', 1)).toBe(true);
  });

  it('rejects a long event overlapping an existing short event', () => {
    const day = { '09:30': [{ text: 'a' }] };
    expect(canPlace(day, '09:00', 2)).toBe(false);
  });

  it('rejects overlap between two long events', () => {
    const day = { '09:00': [{ text: 'a', duration: 3 }] }; // 占 09:00,09:30,10:00
    expect(canPlace(day, '10:30', 1)).toBe(true);
    expect(canPlace(day, '10:00', 2)).toBe(false);
  });

  it('excludes self when resizing/moving the same event', () => {
    const day = { '09:00': [{ text: 'a', duration: 1 }] };
    expect(canPlace(day, '09:00', 3, { slot: '09:00', idx: 0 })).toBe(true);
  });

  it('treats legacy events without duration as 30 minutes', () => {
    const day = { '09:00': [{ text: 'a' }] };
    expect(canPlace(day, '09:30', 1)).toBe(true);
    expect(canPlace(day, '09:00', 2)).toBe(false);
  });
});
