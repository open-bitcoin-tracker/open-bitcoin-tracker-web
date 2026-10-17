import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import * as chart from '../src/lib/bitcoin-chart.ts';
import * as preview from '../src/lib/bitcoin-preview.ts';
import { DAY_MS, type HistoryPoint } from '../src/lib/bitcoin-chart.ts';
import { compactPreviewHistory, mergePreviewHistory, previewPaths, splitPreviewHistory } from '../src/lib/bitcoin-preview.ts';

test('preview sampling preserves real extrema and endpoints with a bounded payload', () => {
  const points = Array.from({ length: 6000 }, (_, i) => ({ time: i * DAY_MS, price: 100 + 99 * Math.sin(i) }));
  const [sample] = compactPreviewHistory([points]);
  assert.equal(sample[0], points[0]);
  assert.equal(sample.at(-1), points.at(-1));
  assert.ok(sample.length <= 604);
  for (let bucket = 0; bucket < 300; bucket++) {
    const inBucket = (p: HistoryPoint) => Math.floor(p.time / points.at(-1)!.time * 300) === bucket;
    const original = points.filter(inBucket);
    const sampled = sample.filter(inBucket);
    assert.equal(Math.min(...sampled.map(p => p.price)), Math.min(...original.map(p => p.price)));
    assert.equal(Math.max(...sampled.map(p => p.price)), Math.max(...original.map(p => p.price)));
  }
  assert.ok(sample.every(p => points.includes(p)));
});

test('missing days remain separate SVG paths after sampling and tail updates', () => {
  const points = [0, 1, 4, 5].map(day => ({ time: day * DAY_MS, price: day + 1 }));
  const segments = compactPreviewHistory(splitPreviewHistory(points));
  assert.equal(segments.length, 2);
  assert.equal(previewPaths(segments).line.match(/M/g)?.length, 2);
  assert.equal(previewPaths(segments).area.match(/Z/g)?.length, 2);
  const updated = mergePreviewHistory(segments, [4, 5, 6, 9, 10].map(day => ({ time: day * DAY_MS, price: day + 2 })));
  assert.equal(updated.length, 3);
  assert.equal(updated[0][0], points[0]);
  assert.equal(updated[1][0].price, 6);
  assert.equal(updated.at(-1)!.at(-1)!.time, 10 * DAY_MS);
  assert.equal(previewPaths(updated).line.match(/M/g)?.length, 3);
});

test('the curve is logarithmic and a ticker cannot bridge a stale history', () => {
  const base = [[{ time: 0, price: 1 }, { time: DAY_MS, price: 10 }, { time: 2 * DAY_MS, price: 100 }]];
  const paths = previewPaths(base);
  const y = [...paths.line.matchAll(/(?:M| L)[\d.]+,([\d.]+)/g)].map(match => Number(match[1]));
  assert.ok(Math.abs(y[0] - y[1] - (y[1] - y[2])) < .02);
  assert.deepEqual(previewPaths(base, { time: 10 * DAY_MS, price: 200 }), paths);
  assert.notEqual(previewPaths(base, { time: 3 * DAY_MS, price: 200 }).line, paths.line);
  assert.throws(() => mergePreviewHistory(base, [{ time: 10 * DAY_MS, price: 200 }]), /needs updating/);
});

const script = ts.transpileModule(readFileSync(new URL('../src/scripts/bitcoin-preview.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = new EventTarget();
  const navigator = { onLine: true };
  const now = 20_000 * DAY_MS + 3600_000;
  class Element {
    textContent = 'initial'; hidden = true; title = '';
    attributes = new Map<string, string>();
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  }
  const elements = new Map<string, Element>();
  const root = {
    dataset: { locale: 'en', copy: JSON.stringify({ price: 'Bitcoin price', updated: 'Last updated', unavailable: 'Unavailable' }), history: JSON.stringify([[[19_995, 1], [19_999, 100]]]) },
    querySelector(selector: string) { const el = new Element(); elements.set(selector, el); return el; },
  };
  const requests: { url: string; signal: AbortSignal; resolve: (response: unknown) => void }[] = [];
  const intervals = new Map<number, { run: () => void; delay: number }>();
  let nextId = 0;
  const module: { startBitcoinPreview?: (root: unknown) => () => void } = {};
  runInNewContext(script, {
    exports: module, document, window, navigator, Intl, AbortController, AbortSignal,
    Date: class extends Date { static now() { return now; } },
    require(name: string) {
      if (name.endsWith('bitcoin-chart')) return chart;
      if (name.endsWith('bitcoin-preview')) return preview;
      return { parseCandles: (result: { points: HistoryPoint[] }) => result.points };
    },
    fetch: (url: string, options: { signal: AbortSignal }) => new Promise(resolve => requests.push({ url, signal: options.signal, resolve })),
    setInterval: (run: () => void, delay: number) => { intervals.set(++nextId, { run, delay }); return nextId; },
    clearInterval: (id: number) => intervals.delete(id),
  });
  const stop = module.startBitcoinPreview!(root);
  const respond = async (index: number, result: unknown, ok = true) => {
    requests[index].resolve({ ok, json: async () => ({ error: [], result }) });
    await setImmediate();
  };
  const visibility = (hidden: boolean) => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  return { document, window, navigator, elements, requests, intervals, stop, respond, visibility, now };
}

test('homepage polls only ticker/recent daily data, retains failures and throttles history', async () => {
  const h = harness();
  assert.equal(h.requests.length, 2);
  assert.ok(h.requests[0].url.includes('/Ticker?'));
  assert.ok(h.requests[1].url.includes('interval=1440&since='));
  assert.equal([...h.intervals.values()][0].delay, 60_000);
  await h.respond(0, { XBTUSD: { c: ['83000'] } });
  await h.respond(1, { points: [19_998, 19_999, 20_000].map(day => ({ time: day * DAY_MS, price: 80000 })) });
  assert.equal(h.elements.get('[data-preview-price]')!.textContent, '$83,000');
  assert.ok(h.elements.get('[data-preview-price]')!.title.startsWith('Last updated:'));
  assert.equal(h.elements.get('[data-preview-status]')!.hidden, true);
  assert.equal(h.elements.get('[data-preview-history-status]')!.hidden, true);
  const path = h.elements.get('[data-preview-line]')!.attributes.get('d');
  [...h.intervals.values()][0].run();
  assert.equal(h.requests.length, 3);
  await h.respond(2, {}, false);
  assert.equal(h.elements.get('[data-preview-price]')!.textContent, '$83,000');
  assert.equal(h.elements.get('[data-preview-line]')!.attributes.get('d'), path);
  assert.equal(h.elements.get('[data-preview-status]')!.hidden, false);
  h.stop();
});

test('hidden/offline pages cancel requests, reject late results and resume after browser back', async () => {
  const h = harness();
  h.visibility(true);
  assert.ok(h.requests.every(r => r.signal.aborted));
  assert.equal(h.intervals.size, 0);
  h.visibility(false);
  assert.equal(h.requests.length, 4);
  await h.respond(0, { XBTUSD: { c: ['99999'] } });
  assert.equal(h.elements.get('[data-preview-price]')!.textContent, 'initial');
  await h.respond(1, { points: [] });
  await h.respond(2, { XBTUSD: { c: ['84000'] } });
  await h.respond(3, { points: [] }, false);
  assert.equal(h.elements.get('[data-preview-price]')!.textContent, '$84,000');
  h.window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
  assert.equal(h.intervals.size, 0);
  h.window.dispatchEvent(new Event('pageshow'));
  assert.equal(h.intervals.size, 1);
  h.navigator.onLine = false;
  h.window.dispatchEvent(new Event('offline'));
  assert.equal(h.intervals.size, 0);
  assert.equal(h.elements.get('[data-preview-status]')!.hidden, false);
  h.stop();
  h.navigator.onLine = true;
  h.window.dispatchEvent(new Event('online'));
  assert.equal(h.intervals.size, 0);
});
