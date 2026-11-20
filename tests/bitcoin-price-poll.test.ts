import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { browserModule } from './support/browser-module.ts';
import type { HistoryPoint } from '../src/lib/bitcoin-chart.ts';
import type { PricePollState } from '../src/lib/bitcoin-price-poll.ts';

function harness() {
  const document = { hidden: false };
  const navigator = { onLine: true };
  const requests: { url: string; signal: AbortSignal; resolve: (response: unknown) => void }[] = [];
  const intervals = new Map<number, { run: () => void; delay: number }>();
  let nextId = 0;
  let now = 1_000_000;
  const poll = browserModule('lib/bitcoin-price-poll', {
    document, navigator, AbortController, AbortSignal, Date: { now: () => now },
    fetch: (url: string, options: { signal: AbortSignal }) => new Promise(resolve => requests.push({ url, signal: options.signal, resolve })),
    setInterval: (run: () => void, delay: number) => { intervals.set(++nextId, { run, delay }); return nextId; },
    clearInterval: (id: number) => intervals.delete(id),
  });
  const subscriber = () => {
    const seen = { points: [] as HistoryPoint[], states: [] as PricePollState[] };
    const stop: () => void = poll.subscribeBitcoinPricePoll({ onPrice: (point: HistoryPoint) => seen.points.push(point), onState: (state: PricePollState) => seen.states.push(state) });
    return { ...seen, stop };
  };
  const respond = async (index: number, price: string | undefined, ok = true) => {
    requests[index].resolve({ ok, json: async () => ({ error: [], result: price ? { XBTUSD: { c: [price] } } : {} }) });
    await setImmediate();
  };
  return { document, navigator, requests, intervals, subscriber, respond, advance: (ms: number) => { now += ms; } };
}

test('every card on a page shares one 60 second ticker request and receives the same quote', async () => {
  const h = harness();
  const chart = h.subscriber();
  const video = h.subscriber();
  assert.equal(h.requests.length, 1);
  assert.ok(h.requests[0].url.includes('/Ticker?pair=XBTUSD'));
  assert.deepEqual([...h.intervals.values()].map(timer => timer.delay), [60_000]);
  await h.respond(0, '83000');
  assert.deepEqual(chart.points, video.points);
  assert.equal(chart.points[0].price, 83000);
  assert.deepEqual(chart.states, ['connecting', 'updated']);
  const late = h.subscriber();
  assert.equal(late.points[0], chart.points[0], 'late subscribers start from the shared quote');
  assert.deepEqual(late.states, ['updated']);
  assert.equal(h.requests.length, 1, 'joining does not trigger another request');
  h.advance(60_000);
  [...h.intervals.values()][0].run();
  await h.respond(1, '84000');
  assert.deepEqual([chart, video, late].map(card => card.points.at(-1)!.price), [84000, 84000, 84000]);
  chart.stop(); video.stop(); late.stop();
});

test('failures keep the last quote, and releasing the last card stops polling and discards late results', async () => {
  const h = harness();
  const chart = h.subscriber();
  await h.respond(0, '83000');
  [...h.intervals.values()][0].run();
  await h.respond(1, undefined, false);
  assert.deepEqual(chart.points.map(point => point.price), [83000]);
  assert.equal(chart.states.at(-1), 'unavailable');
  [...h.intervals.values()][0].run();
  chart.stop();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.requests[2].signal.aborted, true);
  await h.respond(2, '99999');
  assert.deepEqual(chart.points.map(point => point.price), [83000]);
  const returning = h.subscriber();
  assert.equal(h.requests.length, 4, 'the first card back polls immediately');
  assert.equal(returning.points[0].price, 83000);
  returning.stop();
});

test('hidden or offline pages do not poll', async () => {
  const h = harness();
  h.document.hidden = true;
  const chart = h.subscriber();
  assert.equal(h.requests.length, 0);
  chart.stop();
  h.document.hidden = false;
  h.navigator.onLine = false;
  const video = h.subscriber();
  assert.equal(h.requests.length, 0);
  video.stop();
});
