import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const script = ts.transpileModule(readFileSync(new URL('../src/scripts/bitcoin-price.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(hidden = false) {
  class Control extends EventTarget {
    textContent = '—';
    hidden = false;
    dataset: Record<string, string> = {};
    style = { setProperty() {}, opacity: '', transform: '' };
    setAttribute() {}
    removeAttribute() {}
    querySelectorAll() { return []; }
  }
  const controls = new Map<string, Control>();
  const root = Object.assign(new Control(), {
    dataset: { copy: '{}', rangeCopy: '{}', settingsCopy: '{}', locale: 'en-US', historyStart: '0' },
    querySelector: (selector: string) => {
      if (!controls.has(selector)) controls.set(selector, new Control());
      return controls.get(selector);
    },
  });
  const media = Object.assign(new EventTarget(), { matches: false });
  const document = Object.assign(new EventTarget(), { hidden, querySelector: () => root });
  const window = Object.assign(new EventTarget(), { matchMedia: () => media, location: { reload() {} } });
  const timers = new Map<number, () => void>();
  const frames = new Map<number, () => void>();
  const requests: { url: string; resolve: (response: unknown) => void }[] = [];
  const sockets: Socket[] = [];
  let nextId = 1;
  let disconnected = false;
  class Socket extends EventTarget {
    static CLOSING = 2;
    readyState = 0;
    sent: string[] = [];
    constructor() { super(); sockets.push(this); }
    send(message: string) { this.sent.push(message); }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  class Rates {
    needsRefresh() { return false; }
    current() { return { rate: 1 }; }
    convert(points: unknown) { return points; }
  }
  const modules = {
    candleWindow: () => undefined,
    readRangePreferences: () => ({ selected: 'all', counts: {} }),
    readDisplayPreferences: () => ({ currency: 'USD', scale: 'logarithmic' }),
    createRangePill: () => ({ select() {}, destroy() {} }),
    createPriceChangeFormatter: () => () => '',
    CurrencyRates: Rates,
    ChartMotion: class { finish() {} },
  };
  runInNewContext(script, {
    require: () => modules, exports: {}, document, window, navigator: { onLine: true },
    WebSocket: Socket, AbortSignal,
    ResizeObserver: class { observe() {} disconnect() { disconnected = true; } },
    fetch: (url: string) => new Promise(resolve => requests.push({ url, resolve })),
    setTimeout: () => nextId++, clearTimeout() {},
    setInterval: (fn: () => void) => { const id = nextId++; timers.set(id, fn); return id; },
    clearInterval: (id: number) => timers.delete(id),
    requestAnimationFrame: (fn: () => void) => { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const visibility = (hidden: boolean) => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  const respondToTicker = async () => {
    const request = requests.find(request => request.url.includes('/Ticker'))!;
    request.resolve({ ok: true, json: async () => ({ error: [], result: { XBTUSD: { c: ['83000'] } } }) });
    await setImmediate();
  };
  return { controls, document, window, timers, frames, requests, sockets, visibility, respondToTicker, disconnected: () => disconnected };
}

test('hidden trackers release their stream and timers, then reconnect once when visible', () => {
  const h = harness();
  assert.equal(h.sockets.length, 1);
  assert.equal(h.timers.size, 4);
  h.visibility(true);
  assert.equal(h.sockets[0].readyState, 3);
  assert.equal(h.timers.size, 0);
  assert.equal(h.frames.size, 0);
  const requests = h.requests.length;
  h.window.dispatchEvent(new Event('online'));
  assert.equal(h.sockets.length, 1);
  assert.equal(h.requests.length, requests);
  h.visibility(false);
  assert.equal(h.sockets.length, 2);
  assert.equal(h.timers.size, 4);
  h.visibility(false);
  assert.equal(h.sockets.length, 2);
  assert.equal(h.timers.size, 4);
  h.window.dispatchEvent(new Event('pagehide'));
  assert.equal(h.timers.size, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.disconnected(), true);
});

test('a tracker loaded in the background starts no stream or recurring work until shown', () => {
  const h = harness(true);
  assert.equal(h.sockets.length, 0);
  assert.equal(h.timers.size, 0);
  assert.ok(h.requests.every(request => !request.url.includes('api.kraken.com')));
  h.visibility(false);
  assert.equal(h.sockets.length, 1);
  assert.equal(h.timers.size, 4);
  assert.ok(h.requests.some(request => request.url.includes('/Ticker')));
});

test('late REST responses cannot paint a hidden page or replace a newer stream price', async () => {
  const hidden = harness();
  hidden.visibility(true);
  await hidden.respondToTicker();
  assert.equal(hidden.controls.get('[data-price]')!.textContent, '—');
  assert.equal(hidden.frames.size, 0);

  const live = harness();
  live.sockets[0].dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify({
    channel: 'ticker', type: 'update', data: [{ symbol: 'BTC/USD', last: 85000 }],
  }) }));
  assert.equal(live.controls.get('[data-price]')!.textContent, '$85,000');
  await live.respondToTicker();
  assert.equal(live.controls.get('[data-price]')!.textContent, '$85,000');
});
