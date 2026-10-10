import { MAX_BTC, MAX_SATS } from './bitcoin';
import type { AmountUnit } from './bitcoin';

export function formatAmountInput(raw: string): string {
  const match = /^(-?\d+)(\.\d*)?$/.exec(raw);
  if (!match) return raw;
  return `${match[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${match[2] ?? ''}`;
}

export function amountCaretPosition(
  formatted: string,
  rawPosition: number,
): number {
  let position = 0;
  let rawCharacters = 0;
  while (position < formatted.length && rawCharacters < rawPosition) {
    if (formatted[position] !== ',') rawCharacters += 1;
    position += 1;
  }
  return position;
}
export function limitAmountInput(raw: string, unit: AmountUnit): string {
  const text = raw.trim();
  const valid =
    unit === 'sats'
      ? /^\d+$/.test(text)
      : /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text);
  if (!valid) return raw;

  const maximum = unit === 'sats' ? MAX_SATS : BigInt(MAX_BTC);
  const [whole, fraction = ''] = text.split('.');
  const integer = BigInt(whole || '0');
  // Avoid floating-point rounding at the last satoshi below/above the cap.
  return integer > maximum || (integer === maximum && /[1-9]/.test(fraction))
    ? String(maximum)
    : raw;
}
