import { describe, it, expect } from 'vitest';
import { computeBlockStyle } from '../src/renderer/blockLayout.js';

describe('computeBlockStyle', () => {
  it('positions a single short event full width', () => {
    expect(computeBlockStyle(18, 1, 0, 1)).toEqual({
      gridRow: '19 / span 1', widthPct: 100, justifySelf: 'stretch'
    });
  });

  it('spans multiple rows for a long event', () => {
    expect(computeBlockStyle(18, 2, 0, 1).gridRow).toBe('19 / span 2');
    expect(computeBlockStyle(0, 4, 0, 1).gridRow).toBe('1 / span 4');
  });

  it('splits two side-by-side short events into halves', () => {
    expect(computeBlockStyle(18, 1, 0, 2)).toEqual({
      gridRow: '19 / span 1', widthPct: 50, justifySelf: 'start'
    });
    expect(computeBlockStyle(18, 1, 1, 2).justifySelf).toBe('end');
  });

  it('keeps a long exclusive event full width', () => {
    expect(computeBlockStyle(18, 3, 0, 1).widthPct).toBe(100);
  });
});
