export const MAX_BTC = 21_000_000;
export const LAND_KM2 = 148_940_000;
export const toArea = (btc: number) => (btc / MAX_BTC) * LAND_KM2;

/** Accept one decimal place at most; never round or reinterpret invalid input. */
export function parseBitcoinAmount(value: string): number | null {
  const decimal = value.trim();
  if (!/^(?:\d+(?:[.,]\d{0,1})?|[.,]\d{1})$/.test(decimal)) return null;
  const amount = Number(decimal.replace(',', '.'));
  return Number.isFinite(amount) && amount >= 0 && amount <= MAX_BTC ? amount : null;
}

export function exceedsBitcoinPrecision(value: string): boolean {
  return /[.,]\d{2}|[.,].*[.,]/.test(value);
}
