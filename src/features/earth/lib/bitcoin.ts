export const MAX_BTC = 21_000_000;
const SATS_PER_BTC = 100_000_000n;
export const MAX_SATS = BigInt(MAX_BTC) * SATS_PER_BTC;
export type AmountUnit = 'BTC' | 'sats';
export const LAND_KM2 = 148_940_000;
export const toArea = (btc: number) => (btc / MAX_BTC) * LAND_KM2;

function parseSatoshis(
  raw: string,
  unit: AmountUnit,
): { sats: bigint | null; error: string | null } {
  const text = raw.trim();
  if (!text) return { sats: null, error: null };
  if (text.startsWith('-'))
    return { sats: null, error: 'Use a positive amount, or zero.' };
  const valid =
    unit === 'sats'
      ? /^\d+$/.test(text)
      : /^(?:\d+(?:\.\d{0,8})?|\.\d{1,8})$/.test(text);
  if (!valid) {
    return {
      sats: null,
      error:
        unit === 'sats'
          ? 'Enter a whole number of sats.'
          : 'Enter a number with up to 8 decimal places. Use a decimal point.',
    };
  }
  // Compare exact satoshis before converting to floating point.
  const [whole, fraction = ''] = text.split('.');
  const sats =
    unit === 'sats'
      ? BigInt(text)
      : BigInt(whole || '0') * SATS_PER_BTC + BigInt(fraction.padEnd(8, '0'));
  if (sats > MAX_SATS)
    return {
      sats: null,
      error:
        unit === 'sats'
          ? 'The maximum is 2,100,000,000,000,000 sats, the total supply cap.'
          : 'The maximum is 21,000,000 BTC, the total supply cap.',
    };
  return { sats, error: null };
}

export function parseAmount(
  raw: string,
  unit: AmountUnit = 'BTC',
): { value: number | null; error: string | null } {
  const parsed = parseSatoshis(raw, unit);
  return {
    value:
      parsed.sats === null ? null : Number(parsed.sats) / Number(SATS_PER_BTC),
    error: parsed.error,
  };
}

export function convertAmount(
  raw: string,
  from: AmountUnit,
  to: AmountUnit,
): string {
  if (from === to) return raw;
  const { sats } = parseSatoshis(raw, from);
  if (sats === null) return raw;
  if (to === 'sats') return String(sats);
  const fraction = String(sats % SATS_PER_BTC)
    .padStart(8, '0')
    .replace(/0+$/, '');
  return `${sats / SATS_PER_BTC}${fraction ? `.${fraction}` : ''}`;
}
