import { describe, expect, it } from 'vitest';
import { convertAmount, toArea, parseAmount, LAND_KM2 } from './bitcoin';
import { formatArea, formatSide } from './measurements';

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
    expect(formatArea(toArea(0.00000001)).unit).toBe('m²');
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

describe('kilometre display precision', () => {
  it('rounds to nearest while retaining side-length precision', () => {
    expect(formatArea(toArea(1))).toEqual({ number: '7.1', unit: 'km²' });
    expect(formatSide(toArea(1))).toBe('2.66 km');
    expect(formatArea(7.11).number).toBe('7.1');
    expect(formatSide(2.01 ** 2)).toBe('2.01 km');
  });
  it.each([
    ['10.6', 'BTC'],
    ['1060000000', 'sats'],
  ] as const)('displays consistent area and side length for %s %s', (raw, unit) => {
    const area = toArea(parseAmount(raw, unit).value!);
    expect(area).toBeCloseTo(75.17923809523809, 10);
    expect(Math.sqrt(area)).toBeCloseTo(8.670596178766376, 10);
    expect(formatArea(area)).toEqual({ number: '75.2', unit: 'km²' });
    expect(formatSide(area)).toBe('8.67 km');
    expect(formatArea(area, 'imperial')).toEqual({ number: '29.0', unit: 'mi²' });
    expect(formatSide(area, 'imperial')).toBe('5.39 mi');
  });
  it('keeps one decimal for exact values and zero', () => {
    expect(formatArea(10).number).toBe('10.0');
    expect(formatArea(0).number).toBe('0.0');
    expect(formatSide(4)).toBe('2 km');
    expect(formatArea(LAND_KM2).number).toBe('148,940,000.0');
  });
  it('preserves small-area and sub-metre precision', () => {
    expect(formatArea(toArea(0.00000001))).toEqual({
      number: '0.0709',
      unit: 'm²',
    });
    expect(formatSide(0.000001)).toBe('1 m');
    expect(formatSide(toArea(0.00000001))).toBe('0.266 m');
  });
});
