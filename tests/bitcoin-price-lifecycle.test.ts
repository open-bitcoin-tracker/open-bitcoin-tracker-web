import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { browserModule } from './support/browser-module.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/scripts/bitcoin-price.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const feedScript = ts.transpileModule(readFileSync(new URL('../src/lib/bitcoin-live-price.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(hidden = false, fullscreenEnabled = false, options: { locale?: string; currency?: string; title?: string; showPrice?: boolean; storage?: Map<string, string>; blockedStorage?: boolean } = {}) {
  class Control extends EventTarget {
    textContent = '—';
    value = '';
    disabled = true;
    title = '';
    open = false;
    focused = false;
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    attributes = new Map<string, string>();
    hidden = false;
    dataset: Record<string, string> = {};
    style = { setProperty() {}, opacity: '', transform: '' };
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute() {}
    querySelector(selector: string): Control {
      if (!controls.has(selector)) controls.set(selector, new Control());
      return controls.get(selector)!;
    }
    querySelectorAll() { return []; }
  }
  const controls = new Map<string, Control>();
  const root = Object.assign(new Control(), {
    dataset: { copy: '{}', rangeCopy: '{}', settingsCopy: JSON.stringify({ fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', fullscreenUnavailable: 'Fullscreen unavailable' }), locale: options.locale ?? 'en-US', historyStart: '0' },
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
    title: options.title ?? 'Bitcoin Price Chart — Open Bitcoin Tracker',
    hidden, querySelector: () => root, fullscreenEnabled, documentElement,
    fullscreenElement: null as typeof documentElement | null,
    async exitFullscreen() {
      fullscreenExits++;
      document.fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    },
  });
  const storage = options.storage ?? new Map<string, string>(options.showPrice ? [['bitcoin-tracker-price-tab', 'true']] : []);
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => media, location: { reload() {} },
    localStorage: {
      getItem(key: string) { if (options.blockedStorage) throw Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key: string, value: string) { if (options.blockedStorage) throw Error('Storage blocked'); storage.set(key, value); },
    },
  });
  const navigator = { onLine: true };
  const timers = new Map<number, () => void>();
  const frames = new Map<number, () => void>();
  const requests: { url: string; resolve: (response: unknown) => void }[] = [];
  const sockets: Socket[] = [];
  let now = Date.now();
  const timeouts = new Map<number, { run: () => void; at: number }>();
  let nextId = 1;
  let disconnected = false;
  class Socket extends EventTarget {
    static CLOSING = 2;
    readyState = 0;
    sent: string[] = [];
    constructor() { super(); sockets.push(this); }
    send(message: string) { this.sent.push(message); }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
    tick(price: number) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify({
      channel: 'ticker', type: 'update', data: [{ symbol: 'BTC/USD', last: price }],
    }) })); }
  }
  const rates = new Map([['USD', 1], ['EUR', 0.9], ['GBP', 0.75], ['JPY', 150]]);
  class Rates {
    needsRefresh() { return false; }
    current(currency: string) { const rate = rates.get(currency); return rate ? { rate } : undefined; }
    convert(points: unknown) { return points; }
  }
  const savedPreferences: unknown[] = [];
  let pickerDestroyed = false;
  const modules = {
    candleWindow: () => undefined,
    readRangePreferences: () => ({ selected: 'all', counts: {} }),
    readDisplayPreferences: () => ({ currency: options.currency ?? 'USD', scale: 'logarithmic' }),
    createRangePill: () => ({ select() {}, destroy() {} }),
    createCurrencyPicker: () => ({ close() {}, destroy() { pickerDestroyed = true; } }),
    isCurrency: (value: string) => ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY'].includes(value),
    saveDisplayPreferences: (preferences: unknown) => savedPreferences.push(preferences),
    createPriceChangeFormatter: () => () => '',
    CurrencyRates: Rates,
    ChartMotion: class { finish() {} clear() {} },
  };
  const globals = {
    document, window, navigator, Event,
    Date: class extends Date { static now() { return now; } },
    WebSocket: Socket, AbortController, AbortSignal,
    ResizeObserver: class { observe() {} disconnect() { disconnected = true; } },
    fetch: (url: string) => new Promise(resolve => requests.push({ url, resolve })),
    setTimeout: (run: () => void, delay: number) => { const id = nextId++; timeouts.set(id, { run, at: now + delay }); return id; },
    clearTimeout: (id: number) => timeouts.delete(id),
    setInterval: (fn: () => void) => { const id = nextId++; timers.set(id, fn); return id; },
    clearInterval: (id: number) => timers.delete(id),
    requestAnimationFrame: (fn: () => void) => { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  const feedModule = {};
  runInNewContext(feedScript, { ...globals, exports: feedModule });
  const titleModule = browserModule('lib/price-tab-title', globals, browserModule('lib/currency-picker', globals));
  runInNewContext(script, {
    ...globals, require: (name: string) => name.includes('bitcoin-live-price') ? feedModule : name.includes('price-tab-title') ? titleModule : modules, exports: {},
  });
  const visibility = (hidden: boolean) => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  const respondToTicker = async () => {
    const request = requests.find(request => request.url.includes('/Ticker'))!;
    request.resolve({ ok: true, json: async () => ({ error: [], result: { XBTUSD: { c: ['83000'] } } }) });
    await setImmediate();
  };
  return { controls, document, window, navigator, timers, frames, requests, sockets, rates, storage, visibility, respondToTicker, disconnected: () => disconnected, savedPreferences, pickerDestroyed: () => pickerDestroyed,
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timeouts]) if (timer.at <= now) { timeouts.delete(id); timer.run(); }
    },
    fullscreenRequests: () => fullscreenRequests, fullscreenExits: () => fullscreenExits,
    rejectFullscreen() { rejectFullscreen = true; },
  };
}

test('trackers keep their original title and pause background activity by default', () => {
  const h = harness();
  const originalTitle = h.document.title;
  h.sockets[0].tick(85000);
  assert.equal(h.document.title, originalTitle);
  assert.equal(h.controls.get('[data-price-tab-toggle]')!.attributes.get('aria-pressed'), 'false');
  h.visibility(true);
  assert.equal(h.sockets[0].readyState, 3);
  assert.equal(h.timers.size, 0);
  assert.equal(h.frames.size, 0);
  h.visibility(false);
  assert.equal(h.sockets.length, 2);
  h.window.dispatchEvent(new Event('pagehide'));

  const background = harness(true);
  assert.equal(background.sockets.length, 0);
  assert.equal(background.timers.size, 0);
  assert.ok(background.requests.every(request => !request.url.includes('api.kraken.com')));
  background.window.dispatchEvent(new Event('pagehide'));
});

test('the menu requires confirmation, supports Cancel and Escape, and remembers a reversible choice', () => {
  const h = harness();
  const originalTitle = h.document.title;
  h.sockets[0].tick(85000);
  const toggle = h.controls.get('[data-price-tab-toggle]')!;
  const dialog = h.controls.get('[data-price-tab-dialog]')!;
  const confirm = h.controls.get('[data-price-tab-confirm]')!;
  const cancel = h.controls.get('[data-price-tab-cancel]')!;
  const menu = h.controls.get('[data-chart-settings]')!;
  menu.open = true;
  toggle.dispatchEvent(new Event('click'));
  assert.equal(menu.open, false);
  assert.equal(dialog.open, true);
  assert.equal(h.controls.get('[data-price-tab-heading]')!.focused, true);
  assert.equal(h.document.title, originalTitle);
  assert.equal(h.storage.size, 0);
  cancel.dispatchEvent(new Event('click'));
  assert.equal(dialog.open, false);
  assert.equal(h.storage.size, 0);
  assert.equal(h.controls.get('[data-settings-trigger]')!.focused, true);
  toggle.dispatchEvent(new Event('click'));
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  assert.equal(dialog.open, false);
  assert.equal(h.document.title, originalTitle);
  assert.equal(h.storage.size, 0);
  confirm.dispatchEvent(new Event('click'));
  assert.equal(h.storage.size, 0, 'a confirmation outside the open panel cannot enable the option');
  toggle.dispatchEvent(new Event('click'));
  confirm.dispatchEvent(new Event('click'));
  assert.equal(dialog.open, false);
  assert.equal(toggle.attributes.get('aria-pressed'), 'true');
  assert.equal(h.document.title, '$85,000');
  assert.equal(h.storage.get('bitcoin-tracker-price-tab'), 'true');
  const restored = harness(false, false, { storage: h.storage });
  restored.sockets[0].tick(86000);
  assert.equal(restored.document.title, '$86,000');
  restored.window.dispatchEvent(new Event('pagehide'));
  toggle.dispatchEvent(new Event('click'));
  assert.equal(dialog.open, false, 'turning off takes effect immediately');
  assert.equal(toggle.attributes.get('aria-pressed'), 'false');
  assert.equal(h.document.title, originalTitle);
  assert.equal(h.storage.get('bitcoin-tracker-price-tab'), 'false');
  h.visibility(true);
  assert.equal(h.sockets[0].readyState, 3);
  assert.equal(h.timers.size, 0, 'turning off restores background pausing');
  h.window.dispatchEvent(new Event('pagehide'));
  const disabled = harness(false, false, { storage: h.storage });
  disabled.sockets[0].tick(87000);
  assert.equal(disabled.document.title, originalTitle);
  disabled.window.dispatchEvent(new Event('pagehide'));
});

test('invalid or blocked storage keeps the option off until the panel is confirmed', () => {
  for (const value of ['false', 'yes', '"true"', '{}']) {
    const h = harness(false, false, { storage: new Map([['bitcoin-tracker-price-tab', value]]) });
    const originalTitle = h.document.title;
    h.sockets[0].tick(85000);
    assert.equal(h.document.title, originalTitle);
    h.window.dispatchEvent(new Event('pagehide'));
  }
  const h = harness(false, false, { blockedStorage: true });
  const originalTitle = h.document.title;
  h.sockets[0].tick(85000);
  assert.equal(h.document.title, originalTitle);
  h.controls.get('[data-price-tab-toggle]')!.dispatchEvent(new Event('click'));
  h.controls.get('[data-price-tab-confirm]')!.dispatchEvent(new Event('click'));
  assert.equal(h.document.title, '$85,000');
  assert.equal(h.storage.size, 0);
  h.window.dispatchEvent(new Event('pagehide'));
  assert.equal(h.document.title, originalTitle);
  h.controls.get('[data-price-tab-toggle]')!.dispatchEvent(new Event('click'));
  assert.equal(h.controls.get('[data-price-tab-dialog]')!.open, false, 'navigation removes the dialog listeners');
});

test('enabled hidden trackers keep the title ticker while stopping chart work, and clean up on navigation', () => {
  const h = harness(false, false, { showPrice: true });
  assert.equal(h.sockets.length, 1);
  assert.equal(h.timers.size, 4);
  h.visibility(true);
  assert.equal(h.sockets[0].readyState, 0);
  assert.equal(h.timers.size, 2);
  assert.equal(h.frames.size, 0);
  const requests = h.requests.length;
  h.window.dispatchEvent(new Event('online'));
  assert.equal(h.sockets.length, 1);
  assert.equal(h.requests.length, requests);
  h.visibility(false);
  assert.equal(h.sockets.length, 1);
  assert.equal(h.timers.size, 4);
  h.visibility(false);
  assert.equal(h.sockets.length, 1);
  assert.equal(h.timers.size, 4);
  h.window.dispatchEvent(new Event('pagehide'));
  assert.equal(h.timers.size, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.disconnected(), true);
  assert.equal(h.sockets[0].readyState, 3);
});

test('a tracker loaded in the background starts only its title ticker until shown', () => {
  const h = harness(true, false, { showPrice: true });
  assert.equal(h.sockets.length, 1);
  assert.equal(h.timers.size, 2);
  assert.ok(h.requests.every(request => !request.url.includes('/OHLC')));
  h.sockets[0].tick(85000);
  assert.equal(h.document.title, '$85,000');
  assert.equal(h.controls.get('[data-price]')!.textContent, '—');
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
  live.sockets[0].tick(85000);
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
  assert.equal(h.controls.get('[data-price]')!.textContent, '€74,700');
  assert.deepEqual(JSON.parse(JSON.stringify(h.savedPreferences)), [{ scale: 'logarithmic', currency: 'EUR' }]);
  select.dispatchEvent(new Event('change'));
  assert.equal(h.savedPreferences.length, 1);
  h.window.dispatchEvent(new Event('pagehide'));
  assert.equal(h.pickerDestroyed(), true);
});

test('the tab title follows the live ticker in the selected currency, including in background tabs', async () => {
  const h = harness(false, false, { showPrice: true });
  const originalTitle = h.document.title;
  await h.respondToTicker();
  assert.equal(h.document.title, originalTitle, 'the delayed REST fallback is not presented as live');
  h.sockets[0].tick(85000);
  assert.equal(h.document.title, '$85,000');
  const select = h.controls.get('[data-currency]')!;
  select.value = 'EUR';
  select.dispatchEvent(new Event('change'));
  assert.equal(h.document.title, '€76,500');
  assert.equal(h.controls.get('[data-price]')!.textContent, '€76,500');
  h.visibility(true);
  h.sockets[0].tick(86000);
  h.advance(1000);
  assert.equal(h.document.title, '€77,400');
  assert.equal(h.controls.get('[data-price]')!.textContent, '€76,500', 'background ticks only update the title');
  assert.equal(h.frames.size, 0);
});

test('the price-only tab title uses the saved currency and localized formatting', () => {
  const title = 'ビットコイン価格チャート — Open Bitcoin Tracker';
  const h = harness(false, false, { currency: 'JPY', locale: 'ja-JP', title, showPrice: true });
  h.sockets[0].tick(85000);
  assert.equal(h.document.title, '￥12,750,000');
});

test('missing FX, a disconnected feed, offline mode, and page cleanup restore the descriptive title', async () => {
  const h = harness(false, false, { showPrice: true });
  const originalTitle = h.document.title;
  h.sockets[0].tick(85000);
  h.rates.delete('GBP');
  const select = h.controls.get('[data-currency]')!;
  select.value = 'GBP';
  select.dispatchEvent(new Event('change'));
  assert.equal(h.document.title, originalTitle);
  h.rates.set('GBP', 0.75);
  h.sockets[0].tick(86000);
  assert.equal(h.document.title, '£64,500');
  h.sockets[0].close();
  assert.equal(h.document.title, originalTitle);
  await h.respondToTicker();
  assert.equal(h.document.title, originalTitle);
  h.window.dispatchEvent(new Event('online'));
  h.sockets[1].tick(87000);
  assert.equal(h.document.title, '£65,250');
  h.navigator.onLine = false;
  h.window.dispatchEvent(new Event('offline'));
  assert.equal(h.document.title, originalTitle);
  h.navigator.onLine = true;
  h.window.dispatchEvent(new Event('online'));
  h.sockets[2].tick(88000);
  assert.equal(h.document.title, '£66,000');
  h.window.dispatchEvent(new Event('pagehide'));
  assert.equal(h.document.title, originalTitle);
  h.sockets[2].tick(90000);
  assert.equal(h.document.title, originalTitle);
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
