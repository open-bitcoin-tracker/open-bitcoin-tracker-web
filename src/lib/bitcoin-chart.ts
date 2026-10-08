export interface HistoryPoint {
  time: number;
  price: number;
}

export type ChartScale = 'logarithmic' | 'linear';

export const DAY_MS = 86_400_000;

export function parseHistory(csv: string): HistoryPoint[] {
  return csv.split('\n').flatMap((line) => {
    const [date, value] = line.trim().split(',');
    const time = Date.parse(`${date}T00:00:00Z`);
    const price = Number(value);
    return Number.isFinite(time) && Number.isFinite(price) && price > 0 ? [{ time, price }] : [];
  });
}

// Match the app: recent closes replace bundled prices by UTC day.
export function mergeHistory(base: HistoryPoint[], recent: HistoryPoint[]): HistoryPoint[] {
  const days = new Map<number, HistoryPoint>();
  for (const point of [...base, ...recent]) {
    if (!Number.isFinite(point.time) || !Number.isFinite(point.price) || point.price <= 0) continue;
    const time = Math.floor(point.time / DAY_MS) * DAY_MS;
    days.set(time, { time, price: point.price });
  }
  return [...days.values()].sort((a, b) => a.time - b.time);
}

// The app defaults to log10, a straight 1.5px line, and 5% vertical padding.
// SVG keeps those details sharp at every viewport size without a chart library.
export function chartPaths(points: HistoryPoint[], width: number, height: number, scale: ChartScale = 'logarithmic') {
  if (points.length < 2) return { line: '', area: '', positions: [] };
  const start = points[0].time;
  const span = Math.max(points.at(-1)!.time - start, 1);
  const values = points.map((point) => scale === 'logarithmic' ? Math.log10(point.price) : point.price);
  const low = Math.min(...values);
  const range = Math.max(Math.max(...values) - low, 1e-6);
  const bottom = low - range * 0.05;
  const extent = range * 1.1;
  const positions = points.map((point, i) => {
    const x = (point.time - start) / span * width;
    const y = height - (values[i] - bottom) / extent * height;
    return { x, y };
  });
  const coords = positions.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`);
  const line = `M${coords.join(' L')}`;
  return { line, area: `${line} L${width},${height} L0,${height} Z`, positions };
}

// Select a real sample by time, regardless of the pointer's vertical position.
export function nearestHistoryIndex(points: HistoryPoint[], time: number): number {
  if (!points.length) return -1;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (points[middle].time < time) low = middle + 1;
    else high = middle;
  }
  return low > 0 && time - points[low - 1].time < points[low].time - time ? low - 1 : low;
}
