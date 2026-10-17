import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import type { HistoryPoint } from '../src/lib/bitcoin-chart.ts';
import type { PriceFeedState } from '../src/lib/bitcoin-live-price.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/scripts/video-preview.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(reduced = false, locale = 'en', random = 0) {
  class Element extends EventTarget {
    textContent = '—'; hidden = true; title = '';
    attributes = new Map<string, string>();
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
    getAttribute(key: string) { return this.attributes.get(key); }
    toggleAttribute(key: string, value: boolean) { if (value) this.attributes.set(key, ''); else this.attributes.delete(key); }
  }
  const price = new Element();
  const status = new Element();
  const play = new Element();
  const pause = new Element();
  const toggle = Object.assign(new Element(), { querySelector: (s: string) => s === '[data-motion-play]' ? play : pause });
  const video = Object.assign(new Element(), {
    src: '', poster: '', paused: true, muted: false, blocked: false,
    play() {
      if (this.blocked) return Promise.reject(new Error('Autoplay denied'));
      this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve();
    },
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); },
  });
  const document = Object.assign(new EventTarget(), { hidden: false });
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  const window = Object.assign(new EventTarget(), { matchMedia: () => motion });
  const navigator = { onLine: true };
  const subscriptions: { onPrice: (p: HistoryPoint) => void; onState: (s: PriceFeedState) => void; stopped: boolean }[] = [];
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  let disconnected = false;
  const root = {
    dataset: { locale, copy: JSON.stringify({ price: 'Bitcoin price', updated: 'Updated', connecting: 'Connecting', live: 'Live', delayed: 'Reconnecting', offline: 'Offline', unavailable: 'Unavailable', play: 'Play', pause: 'Pause' }),
      backgrounds: JSON.stringify(['fireplace', 'gandalf', 'kido'].map(name => ({ src: `/video-preview-${name}.mp4`, poster: `/posters/${name}.webp` }))) },
    querySelector: (s: string) => ({ '[data-video-price]': price, '[data-video-price-status]': status, '[data-preview-video]': video, '[data-preview-motion]': toggle })[s],
  };
  const module: { startVideoPreview?: (root: unknown) => () => void } = {};
  runInNewContext(script, {
    exports: module, document, window, navigator, Intl, Math: { floor: Math.floor, random: () => random },
    IntersectionObserver: class {
      constructor(callback: typeof intersect) { intersect = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
    require: () => ({ subscribeBitcoinPrice(callbacks: typeof subscriptions[number]) {
      const subscription = { ...callbacks, stopped: false };
      subscriptions.push(subscription);
      callbacks.onState('connecting');
      return () => { subscription.stopped = true; };
    } }),
  });
  const stop = module.startVideoPreview!(root);
  const visibility = (hidden: boolean) => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  return { price, status, video, toggle, play, pause, motion, window, navigator, subscriptions, stop, visibility,
    intersect: (value: boolean) => intersect([{ isIntersecting: value }]), disconnected: () => disconnected };
}

test('video card draws only received quotes, formats for the locale, and retains prices during disconnections', () => {
  const h = harness(false, 'de');
  assert.equal(h.price.textContent, '—');
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

test('each background has an equal selection interval and keeps its matching poster through playback and browser back', () => {
  for (const [random, name] of [[0, 'fireplace'], [1 / 3 - .001, 'fireplace'], [1 / 3, 'gandalf'], [2 / 3 - .001, 'gandalf'], [2 / 3, 'kido'], [.99999, 'kido']] as const) {
    const h = harness(true, 'en', random);
    assert.equal(h.video.poster, `/posters/${name}.webp`);
    assert.equal(h.video.src, '');
    h.intersect(true);
    assert.equal(h.video.src, '');
    h.toggle.dispatchEvent(new Event('click'));
    assert.equal(h.video.src, `/video-preview-${name}.mp4`);
    h.window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    h.window.dispatchEvent(new Event('pageshow'));
    assert.equal(h.video.src, `/video-preview-${name}.mp4`);
    assert.equal(h.video.poster, `/posters/${name}.webp`);
    h.stop();
  }
});
