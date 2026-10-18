import { describe, expect, it } from 'vitest';
import { toArea, LAND_KM2, MAX_BTC, parseBitcoinAmount, exceedsBitcoinPrecision } from './bitcoin';

describe('fixed proportional model', () => {
  it('converts zero, one BTC and the full supply cap', () => {
    expect(toArea(0)).toBe(0);
    expect(toArea(1)).toBeCloseTo(7.09238095238, 10);
    expect(toArea(MAX_BTC)).toBe(LAND_KM2);
  });

  it.each([
    [0.1, 0.709238095238],
    [1000, 7092.38095238],
  ])('calculates the area for %s BTC', (btc, expectedKm2) => {
    expect(toArea(btc)).toBeCloseTo(expectedKm2, 8);
  });
});

describe('private decimal amount entry', () => {
  it.each([
    ['0', 0], ['0.2', 0.2], ['0,2', 0.2], ['.5', 0.5], [',5', 0.5],
    [' 1.2 ', 1.2], ['0.0', 0],
    ['21000000', MAX_BTC], ['1.', 1], ['1000', 1000],
  ])('accepts %s with at most one decimal place', (input, expected) => {
    expect(parseBitcoinAmount(input)).toBe(expected);
  });
  it.each(['', ' ', '-', '-1', '+1', '1e3', 'Infinity', 'NaN', '0.000000001', '0.01', '0,01', '1.20', '.12', ',12',
    '21000000.00000001', '21000001', '1,234.56', '1.234,56', '1 000', 'BTC 1', '1/2'])
    ('keeps invalid or incomplete input unavailable: %s', (input) => {
      expect(parseBitcoinAmount(input)).toBeNull();
    });
});

describe('amount precision feedback', () => {
  it.each(['0.01', '0,01', '1.20', '.12', ',12', ' 2.345 ', '0.1.2', '1,234.56', '1.234,56'])
    ('identifies extra decimal places without rounding: %s', (input) => {
      expect(exceedsBitcoinPrecision(input)).toBe(true);
      expect(parseBitcoinAmount(input)).toBeNull();
    });
  it.each(['', '0.1', '0,1', '10', '1e3', '-2'])
    ('keeps other input out of the precision-specific message: %s', (input) => {
      expect(exceedsBitcoinPrecision(input)).toBe(false);
    });
});

describe('edits within a one-decimal amount', () => {
  it('allows replacing the fractional digit and inserting whole-number digits', () => {
    for (const value of ['0.2', '10.1', '120.1', '.5', '0,5', '0.', '']) {
      expect(exceedsBitcoinPrecision(value)).toBe(false);
    }
  });
  it('rejects extra digits and separators without treating the old amount as invalid', () => {
    for (const value of ['0.12', '0.10', '0,12', '0.1.', '0.1,']) {
      expect(exceedsBitcoinPrecision(value)).toBe(true);
    }
    expect(parseBitcoinAmount('0.1')).toBe(0.1);
  });
});
