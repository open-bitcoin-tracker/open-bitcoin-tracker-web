import { describe, expect, it } from 'vitest';
import {
  amountCaretPosition,
  formatAmountInput,
  limitAmountInput,
} from './amountInput';
import { convertAmount, parseAmount } from './bitcoin';

describe('amount input grouping', () => {
  it.each([
    ['1000', '1,000'],
    ['21000000', '21,000,000'],
    ['2100000000000000', '2,100,000,000,000,000'],
    ['20999999.99999999', '20,999,999.99999999'],
    ['1234.00000000', '1,234.00000000'],
    ['1234.', '1,234.'],
    ['.00000001', '.00000001'],
    ['0001', '0,001'],
    ['', ''],
    ['banana', 'banana'],
    ['1e3', '1e3'],
  ])('displays %s as %s without losing entered precision', (raw, display) => {
    expect(formatAmountInput(raw)).toBe(display);
    expect(display.replace(/,/g, '')).toBe(raw);
  });

  it('preserves exact calculations and unit conversion after grouped paste', () => {
    const raw = '20,999,999.99999999'.replace(/,/g, '');
    expect(parseAmount(raw).error).toBeNull();
    expect(formatAmountInput(convertAmount(raw, 'BTC', 'sats'))).toBe(
      '2,099,999,999,999,999',
    );
    expect(
      convertAmount(convertAmount(raw, 'BTC', 'sats'), 'sats', 'BTC'),
    ).toBe(raw);
  });

  it('keeps the cursor next to the edited digit when grouping changes', () => {
    expect(amountCaretPosition('1,000', 4)).toBe(5);
    expect(amountCaretPosition('12,345', 3)).toBe(4);
    expect(amountCaretPosition('123,456', 3)).toBe(3);
    expect(amountCaretPosition('1,234.00000001', 12)).toBe(13);
    expect(amountCaretPosition('', 0)).toBe(0);
  });
});

describe('amount input supply cap', () => {
  it.each([
    ['21000001', 'BTC', '21000000'],
    [' 21000001 ', 'BTC', '21000000'],
    ['999999999999999999999999', 'BTC', '21000000'],
    ['21000000.00000001', 'BTC', '21000000'],
    ['20999999.99999999', 'BTC', '20999999.99999999'],
    ['21000000.00000000', 'BTC', '21000000.00000000'],
    ['21000000.', 'BTC', '21000000.'],
    ['2100000000000001', 'sats', '2100000000000000'],
    [' 2100000000000001 ', 'sats', '2100000000000000'],
    ['2099999999999999', 'sats', '2099999999999999'],
    ['2100000000000000', 'sats', '2100000000000000'],
  ] as const)('caps %s %s at the exact supply limit', (raw, unit, expected) => {
    expect(limitAmountInput(raw, unit)).toBe(expected);
    expect(parseAmount(expected, unit).error).toBeNull();
  });

  it('preserves blank, incomplete and invalid input for normal validation', () => {
    for (const unit of ['BTC', 'sats'] as const) {
      for (const raw of ['', '.', '-1', 'banana', '1e30']) {
        expect(limitAmountInput(raw, unit)).toBe(raw);
      }
    }
    expect(limitAmountInput('0.000000001', 'BTC')).toBe('0.000000001');
    expect(limitAmountInput('1.5', 'sats')).toBe('1.5');
  });
});
