import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import type { HistoryPoint } from '../src/lib/bitcoin-chart.ts';
import type { PriceFeedState } from '../src/lib/bitcoin-live-price.ts';
import { browserModule } from './support/browser-module.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/scripts/video-preview.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(reduced = false, locale = 'en', currency = 'USD', fxFailure = false) {
  class Element extends EventTarget {
    textContent = '—'; hidden = true; title = '';
    attributes = new Map<string, string>();
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
    getAttribute(key: string) { return this.attributes.get(key); }
    removeAttribute(key: string) { this.attributes.delete(key); }
    toggleAttribute(key: string, value: boolean) { if (value) this.attributes.set(key, ''); else this.attributes.delete(key); }
  }
  const price = new Element();
  const status = new Element();
  const play = new Element();
  const pause = new Element();
  const next = new Element();
  const toggle = Object.assign(new Element(), { querySelector: (s: string) => s === '[data-motion-play]' ? play : pause });
  class Video extends Element {
    src = ''; poster = ''; paused = true; muted = false; blocked = false;
    play() {
      if (this.blocked) return Promise.reject(new Error('Autoplay denied'));
      this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve();
    }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
    load() { this.src = ''; this.pause(); }
  }
  const video = new Video();
  const document = Object.assign(new EventTarget(), { hidden: false });
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  const storage = new Map([['bitcoin-tracker-display', JSON.stringify({ currency, scale: 'linear' })]]);
  const window = Object.assign(new EventTarget(), { matchMedia: () => motion, localStorage: { getItem: (key: string) => storage.get(key) ?? null } });
  const preferences = browserModule('lib/bitcoin-display-preferences', { window, document, Event }, { isCurrency: (code: string) => ['USD', 'EUR', 'GBP'].includes(code) });
  const rates = new Map<string, number>();
  const intervals = new Map<number, () => void>();
  let intervalId = 0;
  const navigator = { onLine: true };
  const subscriptions: { onPrice: (p: HistoryPoint) => void; onState: (s: PriceFeedState) => void; stopped: boolean }[] = [];
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  let disconnected = false;
  const root = {
    dataset: { locale, copy: JSON.stringify({ price: 'Bitcoin price', updated: 'Updated', connecting: 'Connecting', live: 'Live', delayed: 'Reconnecting', offline: 'Offline', unavailable: 'Unavailable', play: 'Play', pause: 'Pause' }),
      backgrounds: JSON.stringify(['fireplace', 'gandalf', 'kido'].map(name => ({ src: `/video-preview-${name}.mp4`, poster: `/posters/${name}.webp` }))) },
    querySelector: (s: string) => ({ '[data-video-price]': price, '[data-video-price-status]': status, '[data-preview-video]': video, '[data-preview-motion]': toggle, '[data-preview-next]': next })[s],
  };
  const module: { startVideoPreview?: (root: unknown) => () => void } = {};
  runInNewContext(script, {
    exports: module, document, window, navigator, Intl,
    setInterval: (run: () => void) => { intervals.set(++intervalId, run); return intervalId; },
    clearInterval: (id: number) => intervals.delete(id),
    IntersectionObserver: class {
      constructor(callback: typeof intersect) { intersect = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
    require: () => ({ ...preferences, CurrencyRates: class {
      current(code: string) { const rate = code === 'USD' ? 1 : rates.get(code); return rate ? { rate } : undefined; }
      async refreshLatest() { if (fxFailure) throw Error('No rates'); rates.set('EUR', .9); rates.set('GBP', .75); }
    }, subscribeBitcoinPrice(callbacks: typeof subscriptions[number]) {
      const subscription = { ...callbacks, stopped: false };
      subscriptions.push(subscription);
      callbacks.onState('connecting');
      return () => { subscription.stopped = true; };
    } }),
  });
  const stop = module.startVideoPreview!(root);
  const visibility = (hidden: boolean) => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  return { price, status, video, toggle, next, play, pause, motion, window, navigator, subscriptions, stop, visibility, intervals,
    currency(code: string, event = 'storage') {
      storage.set('bitcoin-tracker-display', JSON.stringify({ currency: code, scale: 'linear' }));
      window.dispatchEvent(Object.assign(new Event(event), { key: 'bitcoin-tracker-display' }));
    },
    intersect: (value: boolean) => intersect([{ isIntersecting: value }]), disconnected: () => disconnected };
}

test('video card draws only received quotes, formats for the locale, and retains prices during disconnections', () => {
  const h = harness(false, 'de');
  assert.equal(h.price.textContent, '—');
  h.intersect(true);
  h.subscriptions[0].onState('delayed');
  assert.equal(h.status.textContent, 'Unavailable');
  h.subscriptions[0].onPrice({ time: Date.now(), price: 83456.7 });
  assert.equal(h.price.textContent, new Intl.NumberFormat('de', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(83456.7));
  assert.match(h.price.attributes.get('aria-label')!, /Bitcoin price:.*USD.*Updated:/);
  h.subscriptions[0].onState('live');
  assert.equal(h.status.textContent, 'Live');
  const lastPrice = h.price.textContent;
  h.subscriptions[0].onState('delayed');
  assert.equal(h.status.textContent, 'Reconnecting');
  h.navigator.onLine = false;
  h.subscriptions[0].onState('offline');
  assert.equal(h.status.textContent, 'Offline');
  assert.equal(h.price.textContent, lastPrice);
  h.stop();
});

test('video card follows the global currency across tabs and cached-page returns', async () => {
  const h = harness(false, 'de', 'EUR');
  assert.equal(h.intervals.size, 0);
  h.intersect(true);
  h.subscriptions[0].onPrice({ time: Date.now(), price: 100_000 });
  await setImmediate();
  const formatted = (currency: string, value: number) => new Intl.NumberFormat('de', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(value);
  assert.equal(h.price.textContent, formatted('EUR', 90_000));
  assert.match(h.price.attributes.get('aria-label')!, /EUR/);
  h.currency('GBP');
  assert.equal(h.price.textContent, formatted('GBP', 75_000));
  h.visibility(true);
  assert.equal(h.intervals.size, 0);
  h.currency('USD');
  h.visibility(false);
  assert.equal(h.price.textContent, formatted('USD', 100_000));
  h.window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
  h.currency('EUR', 'unobserved');
  h.window.dispatchEvent(new Event('pageshow'));
  assert.equal(h.price.textContent, formatted('EUR', 90_000));
  assert.equal(h.intervals.size, 1);
  h.stop();
  h.currency('USD');
  assert.equal(h.price.textContent, formatted('EUR', 90_000));
  assert.equal(h.intervals.size, 0);
});

test('video card shows unavailable FX without relabeling USD and restores USD immediately', async () => {
  const h = harness(false, 'en', 'EUR', true);
  h.intersect(true);
  h.subscriptions[0].onPrice({ time: Date.now(), price: 100_000 });
  h.subscriptions[0].onState('live');
  await setImmediate();
  assert.equal(h.price.textContent, '—');
  assert.equal(h.status.textContent, 'Unavailable');
  assert.equal(h.price.attributes.get('aria-label'), 'Unavailable');
  h.currency('USD');
  assert.equal(h.price.textContent, '$100,000');
  assert.equal(h.status.textContent, 'Live');
  h.stop();
});

test('offscreen and hidden cards release the feed and reconnect once with the last quote intact', () => {
  const h = harness(true);
  assert.equal(h.subscriptions.length, 0, 'no price connection before intersection');
  h.intersect(true);
  h.intersect(true);
  assert.equal(h.subscriptions.length, 1);
  h.subscriptions[0].onPrice({ time: Date.now(), price: 83456.7 });
  const lastPrice = h.price.textContent;
  h.intersect(false);
  assert.equal(h.subscriptions[0].stopped, true);
  h.visibility(true);
  h.intersect(true);
  h.window.dispatchEvent(new Event('pageshow'));
  assert.equal(h.subscriptions.length, 1, 'hidden cards do not reconnect');
  h.visibility(false);
  h.visibility(false);
  assert.equal(h.subscriptions.length, 2);
  assert.equal(h.price.textContent, lastPrice);
  assert.equal(h.video.src, '', 'reduced motion does not prevent visible price updates');
  h.visibility(true);
  assert.equal(h.subscriptions[1].stopped, true);
  h.intersect(false);
  h.visibility(false);
  assert.equal(h.subscriptions.length, 2, 'offscreen cards stay disconnected on tab return');
  h.stop();
  h.intersect(true);
  assert.equal(h.subscriptions.length, 2, 'cleanup prevents new connections');
});

test('animation loads only in view, pauses in background, and preserves manual pause', () => {
  const h = harness();
  assert.equal(h.video.src, '');
  h.intersect(true);
  assert.equal(h.video.src, '/video-preview-fireplace.mp4');
  assert.equal(h.video.paused, false);
  assert.equal(h.video.muted, true);
  assert.equal(h.toggle.attributes.get('aria-label'), 'Pause');
  h.visibility(true);
  assert.equal(h.video.paused, true);
  h.visibility(false);
  assert.equal(h.video.paused, false);
  h.toggle.dispatchEvent(new Event('click'));
  assert.equal(h.video.paused, true);
  h.intersect(false); h.intersect(true);
  assert.equal(h.video.paused, true);
  h.toggle.dispatchEvent(new Event('click'));
  assert.equal(h.video.paused, false);
  h.stop();
});

test('reduced motion starts with the poster and blocked autoplay leaves a working play control', async () => {
  const h = harness(true);
  h.intersect(true);
  assert.equal(h.video.src, '');
  assert.equal(h.video.paused, true);
  h.video.blocked = true;
  h.toggle.dispatchEvent(new Event('click'));
  await setImmediate();
  assert.equal(h.toggle.attributes.get('aria-label'), 'Play');
  h.video.blocked = false;
  h.toggle.dispatchEvent(new Event('click'));
  assert.equal(h.video.paused, false);
  h.motion.dispatchEvent(new Event('change'));
  assert.equal(h.video.paused, true);
  h.stop();
});

test('browser back restores the feed once and final cleanup removes motion and price subscriptions', () => {
  const h = harness();
  h.intersect(true);
  h.window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
  assert.equal(h.subscriptions[0].stopped, true);
  assert.equal(h.video.paused, true);
  h.window.dispatchEvent(new Event('pageshow'));
  h.window.dispatchEvent(new Event('pageshow'));
  assert.equal(h.subscriptions.length, 2);
  assert.equal(h.video.paused, false);
  h.window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: false }));
  assert.equal(h.disconnected(), true);
  assert.ok(h.subscriptions.every(s => s.stopped));
  assert.equal(h.video.paused, true);
  h.window.dispatchEvent(new Event('pageshow'));
  h.toggle.dispatchEvent(new Event('click'));
  assert.equal(h.subscriptions.length, 2);
  assert.equal(h.video.paused, true);
});

test('starts with the fireplace and cycles in order, preserving selection through browser back', () => {
  const h = harness();
  assert.equal(h.next.hidden, false);
  assert.equal(h.video.poster, '/posters/fireplace.webp');
  assert.equal(h.video.src, '');
  h.intersect(true);
  for (const name of ['gandalf', 'kido', 'fireplace']) {
    h.next.dispatchEvent(new Event('click'));
    assert.equal(h.video.poster, `/posters/${name}.webp`);
    assert.equal(h.video.src, `/video-preview-${name}.mp4`);
    assert.equal(h.video.paused, false);
    h.window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    h.window.dispatchEvent(new Event('pageshow'));
    assert.equal(h.video.src, `/video-preview-${name}.mp4`);
    assert.equal(h.video.poster, `/posters/${name}.webp`);
  }
  h.stop();
  h.next.dispatchEvent(new Event('click'));
  assert.equal(h.video.poster, '/posters/fireplace.webp');
});

test('changing animation while manually paused or using reduced motion shows only its poster', () => {
  for (const reduced of [false, true]) {
    const h = harness(reduced);
    h.intersect(true);
    if (!reduced) h.toggle.dispatchEvent(new Event('click'));
    h.next.dispatchEvent(new Event('click'));
    assert.equal(h.video.poster, '/posters/gandalf.webp');
    assert.equal(h.video.src, '');
    assert.equal(h.video.paused, true);
    h.visibility(true); h.visibility(false);
    h.intersect(false); h.intersect(true);
    assert.equal(h.video.src, '');
    h.toggle.dispatchEvent(new Event('click'));
    assert.equal(h.video.src, '/video-preview-gandalf.mp4');
    assert.equal(h.video.paused, false);
    h.stop();
  }
});

test('changing animation offscreen or in a hidden tab defers loading until visible', () => {
  for (const hiddenTab of [false, true]) {
    const h = harness();
    h.intersect(true);
    if (hiddenTab) h.visibility(true);
    else h.intersect(false);
    h.next.dispatchEvent(new Event('click'));
    assert.equal(h.video.poster, '/posters/gandalf.webp');
    assert.equal(h.video.src, '');
    assert.equal(h.video.paused, true);
    if (hiddenTab) h.visibility(false);
    else h.intersect(true);
    assert.equal(h.video.src, '/video-preview-gandalf.mp4');
    assert.equal(h.video.paused, false);
    h.stop();
  }
});
