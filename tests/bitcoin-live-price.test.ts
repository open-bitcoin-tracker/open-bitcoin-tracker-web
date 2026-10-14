import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import type { PriceFeedState } from '../src/lib/bitcoin-live-price.ts';
import type { HistoryPoint } from '../src/lib/bitcoin-chart.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/bitcoin-live-price.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(hidden = false, online = true) {
  const document = Object.assign(new EventTarget(), { hidden });
  const window = new EventTarget();
  const navigator = { onLine: online };
  const intervals = new Map<number, { run: () => void; delay: number }>();
  const timeouts = new Map<number, { run: () => void; delay: number }>();
  const requests: { signal: AbortSignal; resolve: (response: unknown) => void }[] = [];
  const sockets: Socket[] = [];
  const states: PriceFeedState[] = [];
  const points: HistoryPoint[] = [];
  let now = 1_000_000;
  let nextId = 1;
  class Socket extends EventTarget {
    static CLOSING = 2;
    readyState = 0;
    sent: string[] = [];
    constructor() { super(); sockets.push(this); }
    send(message: string) { this.sent.push(message); }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
    message(body: unknown) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(body) })); }
    tick(price: number) { this.message({ channel: 'ticker', type: 'update', data: [{ symbol: 'BTC/USD', last: price }] }); }
  }
  const module: { subscribeBitcoinPrice?: (callbacks: { onPrice: (point: HistoryPoint) => void; onState: (state: PriceFeedState) => void }) => () => void } = {};
  runInNewContext(script, {
    exports: module, document, window, navigator, Date: { now: () => now }, WebSocket: Socket, AbortController, AbortSignal,
    fetch: (_url: string, options: { signal: AbortSignal }) => new Promise(resolve => requests.push({ signal: options.signal, resolve })),
    setTimeout: (run: () => void, delay: number) => { const id = nextId++; timeouts.set(id, { run, delay }); return id; },
    clearTimeout: (id: number) => timeouts.delete(id),
    setInterval: (run: () => void, delay: number) => { const id = nextId++; intervals.set(id, { run, delay }); return id; },
    clearInterval: (id: number) => intervals.delete(id),
  });
  const stop = module.subscribeBitcoinPrice!({ onPrice: point => points.push(point), onState: state => states.push(state) });
  const visibility = (hidden: boolean) => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  const connectivity = (online: boolean) => { navigator.onLine = online; window.dispatchEvent(new Event(online ? 'online' : 'offline')); };
  const respond = async (index: number, price: string = '83000') => {
    requests[index].resolve({ ok: true, json: async () => ({ error: [], result: { XBTUSD: { c: [price] } } }) });
    await setImmediate();
  };
  const runInterval = (delay: number) => [...intervals.values()].find(timer => timer.delay === delay)!.run();
  return { document, window, intervals, timeouts, requests, sockets, points, states, stop, visibility, connectivity, respond, runInterval, advance: (ms: number) => { now += ms; } };
}

test('the feed subscribes to BTC/USD and only publishes positive, finite ticker prices', async () => {
  const h = harness();
  assert.deepEqual(h.states, ['connecting']);
  h.sockets[0].dispatchEvent(new Event('open'));
  assert.deepEqual(JSON.parse(h.sockets[0].sent[0]), { method: 'subscribe', params: { channel: 'ticker', symbol: ['BTC/USD'], snapshot: true } });
  h.sockets[0].message({ channel: 'ticker', type: 'update', data: [{ symbol: 'ETH/USD', last: 100 }] });
  h.sockets[0].tick(-1);
  h.sockets[0].tick(0);
  h.sockets[0].tick(Infinity);
  assert.equal(h.points.length, 0);
  h.sockets[0].tick(85000);
  assert.equal(h.points[0].price, 85000);
  assert.equal(h.states.at(-1), 'live');
  await h.respond(0);
  assert.equal(h.points.length, 1);
  h.stop();
});

test('a late REST response never overwrites a newer tick, even after its socket closes', async () => {
  const h = harness();
  h.sockets[0].tick(85000);
  h.sockets[0].close();
  assert.equal(h.states.at(-1), 'delayed');
  await h.respond(0);
  assert.deepEqual(h.points.map(point => point.price), [85000]);
  h.runInterval(30_000);
  await h.respond(1, '86000');
  assert.deepEqual(h.points.map(point => point.price), [85000, 86000]);
  h.stop();
});

test('hidden pages abort polling and reject its response even if it arrives after resuming', async () => {
  const h = harness();
  h.visibility(true);
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.sockets[0].readyState, 3);
  assert.equal(h.intervals.size, 0);
  h.visibility(false);
  assert.equal(h.sockets.length, 2);
  assert.equal(h.requests.length, 2);
  await h.respond(0);
  assert.equal(h.points.length, 0);
  await h.respond(1);
  assert.equal(h.points[0].price, 83000);
  assert.equal(h.states.at(-1), 'delayed');
  h.stop();
});

test('heartbeats do not keep a stale ticker live; reconnects use bounded backoff', async () => {
  const h = harness();
  await h.respond(0);
  h.sockets[0].tick(85000);
  h.advance(60_001);
  h.sockets[0].message({ channel: 'heartbeat' });
  h.runInterval(5000);
  assert.equal(h.sockets[0].readyState, 3);
  assert.equal(h.states.at(-1), 'delayed');
  assert.equal([...h.timeouts.values()][0].delay, 1000);
  for (let attempt = 0; attempt < 8; attempt++) {
    const [id, timer] = [...h.timeouts.entries()][0];
    h.timeouts.delete(id);
    timer.run();
    h.sockets.at(-1)!.close();
    assert.equal(h.timeouts.size, 1);
    assert.equal([...h.timeouts.values()][0].delay, Math.min(1000 * 2 ** (attempt + 1), 30_000));
  }
  h.stop();
  assert.equal(h.timeouts.size, 0);
});

test('offline and background subscriptions resume once, and cleanup is permanent', async () => {
  const h = harness(true, false);
  assert.deepEqual(h.states, ['offline']);
  assert.equal(h.sockets.length, 0);
  assert.equal(h.requests.length, 0);
  h.connectivity(true);
  assert.equal(h.sockets.length, 0);
  h.visibility(false);
  h.visibility(false);
  assert.equal(h.sockets.length, 1);
  assert.equal(h.intervals.size, 2);
  h.connectivity(false);
  assert.equal(h.states.at(-1), 'offline');
  assert.equal(h.intervals.size, 0);
  assert.equal(h.sockets[0].readyState, 3);
  h.connectivity(true);
  assert.equal(h.sockets.length, 2);
  h.window.dispatchEvent(new Event('pagehide'));
  h.stop();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.timeouts.size, 0);
  assert.equal(h.requests[1].signal.aborted, true);
  await h.respond(1);
  h.connectivity(true);
  h.visibility(false);
  h.sockets[1].tick(90000);
  assert.equal(h.sockets.length, 2);
  assert.equal(h.points.length, 0);
});
