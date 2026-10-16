import { describe, expect, it } from 'vitest';
import { convertAmount, toArea, parseAmount, LAND_KM2 } from './bitcoin';

describe('fixed proportional model', () => {
  it('converts one BTC, one satoshi and the full cap', () => {
    expect(toArea(1)).toBeCloseTo(7.09238095238, 10);
    expect(toArea(0.00000001) * 1e6).toBeCloseTo(0.07092380952, 10);
    expect(toArea(21_000_000)).toBe(LAND_KM2);
  });
  it('parses satoshis exactly and distinguishes every invalid state', () => {
    for (const text of ['', ' '])
      expect(parseAmount(text)).toEqual({ value: null, error: null });
    for (const text of [
      '-1',
      'banana',
      'NaN',
      'Infinity',
      '1e2',
      '0.000000001',
      '21000000.00000001',
    ])
      expect(parseAmount(text).error).toBeTruthy();
    for (const text of [
      '0',
      '1',
      '.5',
      '1.',
      '0.00000001',
      '21000000.00000000',
    ])
      expect(parseAmount(text).error).toBeNull();
    expect(parseAmount('0').value).toBe(0);
  });
});

describe('Bitcoin and sats units', () => {
  it.each([
    ['0', '0'],
    ['1', '100000000'],
    ['.5', '50000000'],
    ['0.00000001', '1'],
    ['1.23456789', '123456789'],
    ['20999999.99999999', '2099999999999999'],
    ['21000000', '2100000000000000'],
  ])(
    'preserves the exact amount and area for %s BTC / %s sats',
    (btc, sats) => {
      expect(convertAmount(btc, 'BTC', 'sats')).toBe(sats);
      const back = convertAmount(sats, 'sats', 'BTC');
      expect(convertAmount(back, 'BTC', 'sats')).toBe(sats);
      expect(parseAmount(sats, 'sats')).toEqual(parseAmount(btc));
      expect(toArea(parseAmount(back).value!)).toBe(
        toArea(parseAmount(btc).value!),
      );
    },
  );
  it('rejects fractional sats, malformed amounts and values above the supply cap', () => {
    for (const text of [
      '0.5',
      '1.0',
      '-1',
      '1e8',
      'NaN',
      'Infinity',
      'banana',
      '2100000000000001',
    ]) {
      expect(parseAmount(text, 'sats').value).toBeNull();
      expect(parseAmount(text, 'sats').error).toBeTruthy();
    }
    expect(parseAmount('0.5', 'sats').error).toContain('whole number');
    expect(parseAmount('2100000000000001', 'sats').error).toContain(
      '2,100,000,000,000,000 sats',
    );
    expect(parseAmount('00001', 'sats').value).toBe(0.00000001);
  });
  it('retains blank and invalid input when changing units', () => {
    for (const text of ['', ' ', 'banana', '-1']) {
      expect(convertAmount(text, 'BTC', 'sats')).toBe(text);
      expect(convertAmount(text, 'sats', 'BTC')).toBe(text);
    }
    expect(parseAmount('', 'sats')).toEqual({ value: null, error: null });
    expect(convertAmount('1.', 'BTC', 'BTC')).toBe('1.');
  });
});
