import { describe, expect, it } from 'vitest';
import { formatActualValue } from './formatActualValue';

describe('formatActualValue', () => {
  it('marks undefined and null as missing', () => {
    expect(formatActualValue(undefined, 'missing')).toBe('missing');
    expect(formatActualValue(null, 'missing')).toBe('missing');
  });

  it('keeps confirmed falsy values distinct from missing', () => {
    expect(formatActualValue(false, 'missing')).toBe('false');
    expect(formatActualValue(0, 'missing')).toBe('0');
    expect(formatActualValue('', 'missing')).toBe('""');
  });
});
