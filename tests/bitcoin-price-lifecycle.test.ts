import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const script = ts.transpileModule(readFileSync(new URL('../src/scripts/bitcoin-price.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const feedScript = ts.transpileModule(readFileSync(new URL('../src/lib/bitcoin-live-price.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(hidden = false, fullscreenEnabled = false) {
  class Control extends EventTarget {
    textContent = '—';
    value = '';
    disabled = true;
    title = '';
    open = false;
    focus() {}
    attributes = new Map<string, string>();
    hidden = false;
    dataset: Record<string, string> = {};
    style = { setProperty() {}, opacity: '', transform: '' };
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute() {}
    querySelectorAll() { return []; }
  }
  const controls = new Map<string, Control>();
  const root = Object.assign(new Control(), {
    dataset: { copy: '{}', rangeCopy: '{}', settingsCopy: JSON.stringify({ fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', fullscreenUnavailable: 'Fullscreen unavailable' }), locale: 'en-US', historyStart: '0' },
    querySelector: (selector: string) => {
      if (!controls.has(selector)) controls.set(selector, new Control());
      return controls.get(selector);
    },
  });
  const media = Object.assign(new EventTarget(), { matches: false });
  let fullscreenRequests = 0;
  let fullscreenExits = 0;
  let rejectFullscreen = false;
  const documentElement = {
    async requestFullscreen() {
      fullscreenRequests++;
      if (rejectFullscreen) throw Error('Fullscreen denied');
      document.fullscreenElement = documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
    },
  };
  const document = Object.assign(new EventTarget(), {
    hidden, querySelector: () => root, fullscreenEnabled, documentElement,
    fullscreenElement: null as typeof documentElement | null,
    async exitFullscreen() {
      fullscreenExits++;
      document.fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    },
  });
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
  const savedPreferences: unknown[] = [];
  let pickerDestroyed = false;
  const modules = {
    candleWindow: () => undefined,
    readRangePreferences: () => ({ selected: 'all', counts: {} }),
    readDisplayPreferences: () => ({ currency: 'USD', scale: 'logarithmic' }),
    createRangePill: () => ({ select() {}, destroy() {} }),
    createVideoCurrencyPicker: () => ({ close() {}, destroy() { pickerDestroyed = true; } }),
    isCurrency: (value: string) => ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY'].includes(value),
    saveDisplayPreferences: (preferences: unknown) => savedPreferences.push(preferences),
    createPriceChangeFormatter: () => () => '',
    CurrencyRates: Rates,
    ChartMotion: class { finish() {} clear() {} },
  };
  const globals = {
    document, window, navigator: { onLine: true },
    WebSocket: Socket, AbortController, AbortSignal,
    ResizeObserver: class { observe() {} disconnect() { disconnected = true; } },
    fetch: (url: string) => new Promise(resolve => requests.push({ url, resolve })),
    setTimeout: () => nextId++, clearTimeout() {},
    setInterval: (fn: () => void) => { const id = nextId++; timers.set(id, fn); return id; },
    clearInterval: (id: number) => timers.delete(id),
    requestAnimationFrame: (fn: () => void) => { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  const feedModule = {};
  runInNewContext(feedScript, { ...globals, exports: feedModule });
  runInNewContext(script, {
    ...globals, require: (name: string) => name.includes('bitcoin-live-price') ? feedModule : modules, exports: {},
  });
  const visibility = (hidden: boolean) => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  const respondToTicker = async () => {
    const request = requests.find(request => request.url.includes('/Ticker'))!;
    request.resolve({ ok: true, json: async () => ({ error: [], result: { XBTUSD: { c: ['83000'] } } }) });
    await setImmediate();
  };
  return { controls, document, window, timers, frames, requests, sockets, visibility, respondToTicker, disconnected: () => disconnected, savedPreferences, pickerDestroyed: () => pickerDestroyed,
    fullscreenRequests: () => fullscreenRequests, fullscreenExits: () => fullscreenExits,
    rejectFullscreen() { rejectFullscreen = true; },
  };
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


test('the chart currency select updates the live price and shared preferences, and cleans up the picker', async () => {
  const h = harness();
  await h.respondToTicker();
  const select = h.controls.get('[data-currency]')!;
  assert.equal(select.value, 'USD');
  assert.equal(select.disabled, false);
  assert.equal(h.controls.get('[data-price]')!.textContent, '$83,000');
  select.value = 'EUR';
  select.dispatchEvent(new Event('change'));
  assert.equal(h.controls.get('[data-price]')!.textContent, '€83,000');
  assert.deepEqual(JSON.parse(JSON.stringify(h.savedPreferences)), [{ scale: 'logarithmic', currency: 'EUR' }]);
  select.dispatchEvent(new Event('change'));
  assert.equal(h.savedPreferences.length, 1);
  h.window.dispatchEvent(new Event('pagehide'));
  assert.equal(h.pickerDestroyed(), true);
});

test('the chart fullscreen button enters, exits, updates its label, and reports rejected requests', async () => {
  const h = harness(false, true);
  const button = h.controls.get('[data-fullscreen]')!;
  const status = h.controls.get('[data-control-status]')!;
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.equal(button.attributes.get('aria-label'), 'Fullscreen');
  assert.equal(h.controls.get('[data-fullscreen-label]')!.textContent, 'Fullscreen');
  h.controls.get('[data-chart-settings]')!.open = true;
  button.dispatchEvent(new Event('click'));
  assert.equal(h.fullscreenRequests(), 1);
  assert.equal(button.title, 'Exit fullscreen');
  assert.equal(h.controls.get('[data-fullscreen-label]')!.textContent, 'Exit fullscreen');
  assert.equal(h.controls.get('[data-chart-settings]')!.open, false);
  assert.equal(button.attributes.get('aria-label'), 'Exit fullscreen');
  button.dispatchEvent(new Event('click'));
  assert.equal(h.fullscreenExits(), 1);
  assert.equal(button.title, 'Fullscreen');
  h.rejectFullscreen();
  button.dispatchEvent(new Event('click'));
  await setImmediate();
  assert.equal(status.hidden, false);
  assert.equal(status.textContent, 'Fullscreen unavailable');
  h.window.dispatchEvent(new Event('pagehide'));
  h.document.fullscreenElement = h.document.documentElement;
  h.document.dispatchEvent(new Event('fullscreenchange'));
  assert.equal(button.title, 'Fullscreen');
});

test('the chart hides and disables fullscreen when the browser does not support it', () => {
  const h = harness();
  const button = h.controls.get('[data-fullscreen]')!;
  assert.equal(button.hidden, true);
  assert.equal(button.disabled, true);
});
