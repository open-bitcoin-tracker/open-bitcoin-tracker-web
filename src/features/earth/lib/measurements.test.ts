import { describe, expect, it } from 'vitest';
import { LAND_KM2, toArea } from './bitcoin';
import { formatArea, formatSide } from './measurements';

describe('measurement display', () => {
  it('selects metric area units at hectare and square-kilometre boundaries', () => {
    expect(formatArea(0.00999)).toEqual({ number: '9,990', unit: 'm²' });
    expect(formatArea(0.01)).toEqual({ number: '1', unit: 'ha' });
    expect(formatArea(0.5)).toEqual({ number: '50', unit: 'ha' });
    expect(formatArea(0.999)).toEqual({ number: '100', unit: 'ha' });
    expect(formatArea(1)).toEqual({ number: '1.0', unit: 'km²' });
  });

  it('converts independently known customary area equivalents', () => {
    expect(formatArea(0.00000009290304, 'imperial')).toEqual({
      number: '1',
      unit: 'ft²',
    });
    expect(formatArea(0.0040468564224, 'imperial')).toEqual({
      number: '1',
      unit: 'acres',
    });
    expect(formatArea(0.40468564224, 'imperial')).toEqual({
      number: '100',
      unit: 'acres',
    });
    expect(formatArea(2.589988110336, 'imperial')).toEqual({
      number: '1.0',
      unit: 'mi²',
    });
  });

  it('uses square feet below an acre and acres below a square mile', () => {
    expect(formatArea(0.004, 'imperial').unit).toBe('ft²');
    expect(formatArea(2.58, 'imperial').unit).toBe('acres');
    expect(formatArea(2.59, 'imperial').unit).toBe('mi²');
  });

  it('rounds hectares and acres upward using the same rule as distances', () => {
    expect(formatArea(toArea(0.1))).toEqual({ number: '71', unit: 'ha' });
    expect(formatArea(toArea(0.1), 'imperial')).toEqual({
      number: '176',
      unit: 'acres',
    });
    expect(formatArea(0.010001)).toEqual({ number: '2', unit: 'ha' });
    expect(formatArea(0.004047, 'imperial')).toEqual({
      number: '2',
      unit: 'acres',
    });
  });

  it('keeps one satoshi visible in both systems and handles zero and the supply cap', () => {
    expect(formatArea(toArea(1e-8), 'imperial')).toEqual({
      number: '0.7634',
      unit: 'ft²',
    });
    expect(formatSide(toArea(1e-8), 'imperial')).toBe('0.9 ft');
    expect(formatArea(0, 'imperial')).toEqual({ number: '0.0', unit: 'mi²' });
    expect(formatSide(0, 'imperial')).toBe('0 ft');
    expect(formatArea(LAND_KM2, 'imperial')).toEqual({
      number: '57,506,055.5',
      unit: 'mi²',
    });
  });

  it('converts side lengths using international feet and miles', () => {
    expect(formatSide(0.0001, 'imperial')).toBe('33 ft');
    expect(formatSide(1, 'imperial')).toBe('3,281 ft');
    expect(formatSide(2.589988110336, 'imperial')).toBe('1 mi');
    expect(formatSide(toArea(1), 'imperial')).toBe('2 mi');
  });

  it.each([
    [0.21, '0.3 m'],
    [0.5, '0.5 m'],
    [0.51, '0.6 m'],
    [0.99, '1 m'],
    [1, '1 m'],
    [1.01, '2 m'],
    [842.163, '843 m'],
    [1000, '1 km'],
    [2000, '2 km'],
    [2001, '3 km'],
  ])(
    'rounds a %s metre side upward with decimals only below one',
    (metres, expected) => {
      expect(formatSide((metres / 1000) ** 2)).toBe(expected);
    },
  );

  it('preserves exact feet after conversion and rounds fractional feet up', () => {
    expect(formatSide(((100 * 0.3048) / 1000) ** 2, 'imperial')).toBe('100 ft');
    expect(formatSide(((100.01 * 0.3048) / 1000) ** 2, 'imperial')).toBe(
      '101 ft',
    );
  });
});
