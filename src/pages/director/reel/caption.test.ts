import { describe, expect, it } from 'vitest';
import { wrapCaptionLines } from './caption';

describe('reel caption wrapping', () => {
  const measure = (value: string) => value.length;

  it('wraps bounded captions into readable safe-area lines', () => {
    expect(wrapCaptionLines('A quiet monument becomes chosen connection', measure, 18)).toEqual([
      'A quiet monument',
      'becomes chosen',
      'connection',
    ]);
  });

  it('truncates overflow on the final allowed line', () => {
    const lines = wrapCaptionLines('one two three four five six seven eight nine', measure, 10, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(lines[1].length).toBeLessThanOrEqual(10);
  });

  it('splits an unbroken caption token without escaping the safe width', () => {
    const lines = wrapCaptionLines('abcdefghijklmnop', measure, 5, 2);
    expect(lines).toEqual(['abcde', 'fghi…']);
    expect(lines.every((line) => measure(line) <= 5)).toBe(true);
  });
});
