import { chartPaths, chartViewport, DAY_MS, type HistoryPoint } from './bitcoin-chart.ts';

export const PREVIEW_WIDTH = 800;
export const PREVIEW_HEIGHT = 260;
export type PreviewHistory = HistoryPoint[][];

/** Split before sampling: a missing day must never become a painted connector. */
export function splitPreviewHistory(points: HistoryPoint[]): PreviewHistory {
  const segments: PreviewHistory = [];
  for (const point of points) {
    const segment = segments.at(-1);
    if (!segment || point.time - segment.at(-1)!.time > DAY_MS) segments.push([point]);
    else segment.push(point);
  }
  return segments;
}

/** Keep real lows/highs in each time bucket, plus segment endpoints (~600 points). */
export function compactPreviewHistory(segments: PreviewHistory, columns = 300): PreviewHistory {
  const first = segments[0]?.[0];
  const last = segments.at(-1)?.at(-1);
  if (!first || !last) return [];
  const span = Math.max(last.time - first.time, 1);
  return segments.map(segment => {
    const kept = new Set<HistoryPoint>([segment[0], segment.at(-1)!]);
    let start = 0;
    while (start < segment.length) {
      const column = Math.floor((segment[start].time - first.time) / span * columns);
      let end = start + 1;
      let low = segment[start];
      let high = low;
      while (end < segment.length && Math.floor((segment[end].time - first.time) / span * columns) === column) {
        const point = segment[end++];
        if (point.price < low.price) low = point;
        if (point.price > high.price) high = point;
      }
      kept.add(low); kept.add(high);
      start = end;
    }
    return [...kept].sort((a, b) => a.time - b.time);
  });
}

/** Replace the overlapping tail without bridging a stale bundle or missing days. */
export function mergePreviewHistory(base: PreviewHistory, recent: HistoryPoint[]): PreviewHistory {
  if (!recent.length) return base;
  const last = base.at(-1)?.at(-1);
  const start = recent[0].time;
  if (last && start > last.time + DAY_MS) throw new Error('Historical data needs updating');
  const kept = base.map(segment => segment.filter(point => point.time < start)).filter(segment => segment.length);
  const tail = splitPreviewHistory(recent);
  const previous = base.findLast(segment => segment[0].time < start);
  if (kept.length && previous && start <= previous.at(-1)!.time + DAY_MS) {
    kept.at(-1)!.push(...tail.shift()!);
  }
  return compactPreviewHistory([...kept, ...tail]);
}

export function previewPaths(history: PreviewHistory, current?: HistoryPoint) {
  const segments = history.map(segment => [...segment]);
  const last = segments.at(-1)?.at(-1);
  // A ticker alone cannot fill multiple missing daily observations.
  if (last && current && current.time >= last.time && current.time - last.time < 2 * DAY_MS) {
    segments.at(-1)!.push(current);
  }
  const points = segments.flat();
  if (points.length < 2) return { line: '', area: '' };
  const viewport = chartViewport(points, 'logarithmic');
  const paths = segments.map(segment => chartPaths(segment, PREVIEW_WIDTH, PREVIEW_HEIGHT, 'logarithmic', viewport));
  return { line: paths.map(path => path.line).join(' '), area: paths.map(path => path.area).join(' ') };
}
