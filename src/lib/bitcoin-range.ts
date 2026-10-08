import { DAY_MS, type HistoryPoint } from './bitcoin-chart';

export const rangeSlots = [
  { unit: 'day', initial: 1, max: 7 },
  { unit: 'week', initial: 1, max: 4 },
  { unit: 'month', initial: 6, max: 12 },
  { unit: 'year', initial: 10, max: 15 },
] as const;

export type RangeUnit = typeof rangeSlots[number]['unit'];
export type BitcoinRange = { unit: RangeUnit; count: number } | { unit: 'all' };

// Match the app's cycling slots, including wrapping at each end.
export function stepRange(unit: RangeUnit, count: number, step: number): number {
  const max = rangeSlots.find((slot) => slot.unit === unit)!.max;
  return ((count - 1 + step) % max + max) % max + 1;
}

export function candleWindow(range: BitcoinRange) {
  if (range.unit === 'day') return { interval: 15, take: range.count * 96 };
  if (range.unit === 'week') return { interval: 60, take: range.count * 168 };
  if (range.unit === 'month' && range.count === 1) return { interval: 60, take: 720 };
  return undefined;
}

export function historyForRange(points: HistoryPoint[], range: BitcoinRange): HistoryPoint[] {
  if (range.unit === 'all' || !points.length) return points;
  const window = candleWindow(range);
  if (window) return points.slice(-window.take);
  const days = range.unit === 'year' ? range.count * 365 : range.count === 12 ? 365 : range.count * 30;
  const cutoff = points.at(-1)!.time - days * DAY_MS;
  return points.filter((point) => point.time >= cutoff);
}

export function parseCandles(result: Record<string, unknown>): HistoryPoint[] {
  const rows = Object.values(result).find(Array.isArray);
  if (!rows) throw new Error('Missing prices');
  const points = rows.flatMap((row: unknown) => {
    if (!Array.isArray(row)) return [];
    const time = Number(row[0]) * 1000;
    const price = Number(row[4]);
    return Number.isFinite(time) && Number.isFinite(price) && price > 0 ? [{ time, price }] : [];
  }).sort((a, b) => a.time - b.time);
  if (points.length < 2) throw new Error('Insufficient prices');
  return points;
}
