import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { tracker } from '../src/i18n/tracker.ts';

const names = ['bitcoin-price', 'bitcoin-live-price', 'bitcoin-chart', 'bitcoin-chart-motion', 'bitcoin-price-change', 'bitcoin-range', 'bitcoin-range-preferences', 'bitcoin-range-pill', 'bitcoin-currency', 'bitcoin-display-preferences', 'video-currency-picker'];
const scripts = Object.fromEntries(names.map(name => [name, ts.transpileModule(
  readFileSync(new URL(`../src/${['bitcoin-price', 'bitcoin-range-pill'].includes(name) ? 'scripts' : 'lib'}/${name}.ts`, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText]));
const key = 'bitcoin-tracker-ranges';
const defaults = { counts: { day: 1, week: 1, month: 6, year: 10 }, selected: 'all' };
const units = ['day', 'week', 'month', 'year', 'all'];
const rect = (left = 0, width = 100) => ({ left, right: left + width, top: 0, bottom: 36, width, height: 36 });

class Control extends EventTarget {
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children = new Map<string, Control>();
  style: Record<string, any> = { setProperty(name: string, value: string) { this[name] = value; } };
  hidden = false;
  textContent = '';
  captured = -1;
  id = '';
  parent: Control | undefined;
  value = '';
  checked = false;
  disabled = false;
  tabIndex = -1;
  open = false;
  contains(node: Control | null) {
    while (node) { if (node === this) return true; node = node.parent ?? null; }
    return false;
  }
  querySelector(selector: string): Control {
    if (!this.children.has(selector)) this.children.set(selector, Object.assign(new Control(), { parent: this }));
    return this.children.get(selector)!;
  }
  querySelectorAll(_selector: string): Control[] { return []; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  hasAttribute(name: string) { return name in this.attributes; }
  removeAttribute(name: string) { delete this.attributes[name]; }
  getBoundingClientRect() { return rect(); }
  closest(selector: string): Control | null {
    if (selector === 'button') return this.dataset.rangeSelect || this.dataset.rangeStep ? this : null;
    if (selector === '[data-range-select]') return this.dataset.rangeSelect ? this : null;
    if (selector === '[data-range-step]') return this.dataset.rangeStep ? this : null;
    if (selector === '[data-range-slot]') return this.parent ?? null;
    return null;
  }
  setPointerCapture(id: number) { this.captured = id; }
  hasPointerCapture(id: number) { return this.captured === id; }
  releasePointerCapture() { this.captured = -1; }
  focus() {}
  scrollIntoView() {}
}

function page(stored: Map<string, string>, locale = 'en', blocked: 'read' | 'write' | undefined = undefined, fxFailure = false, hold?: 'fx' | 'candles', priceMultiplier = 1) {
  const root = new Control();
  root.dataset = {
    locale,
    copy: JSON.stringify({ all: 'All', price: 'Bitcoin price', scale: 'Log', linearScale: 'Linear', history: 'Unavailable' }),
    rangeCopy: JSON.stringify({ loading: 'Loading price history', unavailable: 'Price history unavailable', suffixes: { day: 'D', week: locale === 'es' ? 'S' : 'W', month: 'M', year: 'Y' } }),
    settingsCopy: JSON.stringify({ logarithmic: 'Logarithmic', linear: 'Linear', fxLoading: 'Loading exchange rates', fxUnavailable: 'Exchange rates unavailable', fxHistoryUnavailable: 'Exchange-rate history unavailable' }),
    historyStart: String(Date.now() - 86_400_000),
  };
  const bar = root.querySelector('[data-range-bar]');
  bar.getBoundingClientRect = () => rect(0, 500);
  const pill = bar.querySelector('[data-range-pill]');
  pill.hidden = true;
  pill.getBoundingClientRect = () => rect(Number(pill.style.transform?.match(/\(([^p]+)/)?.[1] ?? 400));
  const slots = units.map((unit, i) => {
    const slot = Object.assign(new Control(), { dataset: { rangeSlot: unit, selected: String(unit === 'all') } });
    slot.getBoundingClientRect = () => rect(i * 100);
    const button = slot.querySelector('[data-range-select]');
    button.dataset.rangeSelect = unit;
    const label = button.querySelector('[data-range-label]');
    label.getBoundingClientRect = () => rect(i * 100 + 40, 20);
    slot.children.set('[data-range-label]', label);
    const steps = unit === 'all' ? [] : ['1', '-1'].map(step => {
      const control = Object.assign(new Control(), { parent: slot, dataset: { rangeStep: step } });
      return control;
    });
    slot.querySelectorAll = () => steps;
    return slot;
  });
  bar.querySelectorAll = () => slots;
  const scaleOptions = ['logarithmic', 'linear'].map(value => Object.assign(new Control(), { value }));
  root.querySelectorAll = () => scaleOptions;

  const currencySelect = root.querySelector('[data-currency]');
  const currencyPicker = root.querySelector('[data-currency-picker]');
  const currencyTrigger = currencyPicker.querySelector('[data-currency-trigger]');
  const currencyList = currencyPicker.querySelector('[data-currency-list]');
  const currencyOptions = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY'].map(code => Object.assign(new Control(), {
    dataset: { currencyOption: code }, parent: currencyList,
  }));
  currencyList.querySelectorAll = () => currencyOptions;
  const priceCurrencyPicker = root.querySelector('[data-price-currency-picker]');
  const priceCurrencyTrigger = priceCurrencyPicker.querySelector('[data-currency-trigger]');
  const priceCurrencyList = priceCurrencyPicker.querySelector('[data-currency-list]');
  const priceCurrencyOptions = currencyOptions.map(option => Object.assign(new Control(), {
    dataset: { ...option.dataset }, parent: priceCurrencyList,
  }));
  priceCurrencyList.querySelectorAll = () => priceCurrencyOptions;
  const document = Object.assign(new EventTarget(), { hidden: false, querySelector: () => root });
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => Object.assign(new EventTarget(), { matches: true }),
  });
  Object.defineProperty(window, 'localStorage', {
    get() {
      if (blocked === 'read') throw new Error('Storage blocked');
      return {
        getItem: (name: string) => stored.get(name) ?? null,
        setItem: (name: string, value: string) => {
          if (blocked === 'write') throw new Error('Storage full');
          stored.set(name, value);
        },
      };
    },
  });
  const requests: string[] = [];
  let releaseRequests = () => {};
  const gate = new Promise<void>(resolve => { releaseRequests = resolve; });
  const frames = new Map<number, (now: number) => void>();
  let frameId = 0;
  const now = Date.now();
  const day = 86_400_000;
  const context = createContext({
    document, window, navigator: { onLine: true }, Intl, Date, Event, AbortController, AbortSignal, URLSearchParams,
    performance: { now: () => 0 },
    WebSocket: class extends EventTarget { static CLOSING = 2; readyState = 0; close() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (callback: (now: number) => void) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    fetch: async (url: string) => {
      requests.push(url);
      if (url.includes('frankfurter')) {
        if (hold === 'fx') await gate;
        const query = new URL(url).searchParams;
        const days = query.has('from') ? [now - day, now] : [now];
        const quotes = query.get('quotes')!.split(',');
        const rates = days.flatMap(time => quotes.map(quote => ({ date: new Date(time).toISOString().slice(0, 10), base: 'USD', quote, rate: time < now ? .5 : .8 })));
        return { ok: !fxFailure, status: fxFailure ? 503 : 200, json: async () => rates };
      }
      const interval = Number(new URL(url, 'https://example.com').searchParams.get('interval')) || 1440;
      if (hold === 'candles' && interval !== 1440) await gate;
      const rows = [now - interval * 60_000, now].map((time, i) => [Math.floor(time / 1000), '', '', '', String((100 + i) * priceMultiplier)]);
      return { ok: true, text: async () => `${new Date(now - day).toISOString().slice(0, 10)},${100 * priceMultiplier}\n${new Date(now).toISOString().slice(0, 10)},${101 * priceMultiplier}`,
        json: async () => ({ error: [], result: url.includes('Ticker') ? { pair: { c: [String(101 * priceMultiplier)] } } : { pair: rows } }) };
    },
  });
  const modules = new Map<string, { exports: unknown }>();
  function load(name: string): unknown {
    name = name.split('/').at(-1)!;
    if (!modules.has(name)) {
      const module = { exports: {} };
      modules.set(name, module);
      runInContext(`(function(require, module, exports) { ${scripts[name]}\n})`, context)(load, module, module.exports);
    }
    return modules.get(name)!.exports;
  }
  load('bitcoin-price');
  function event(type: string, target = bar, extra = {}) {
    const event = Object.assign(new Event(type, { cancelable: true }), { detail: 0, ...extra });
    Object.defineProperty(event, 'target', { value: target });
    bar.dispatchEvent(event);
    return event;
  }
  return {
    root, slots, pill, requests, document, scaleOptions, currencyOptions, currencySelect, currencyTrigger, currencyList, releaseRequests,
    priceCurrencyPicker, priceCurrencyTrigger, priceCurrencyList, priceCurrencyOptions,
    currency(code: string) {
      if (currencyTrigger.attributes['aria-expanded'] !== 'true') currencyTrigger.dispatchEvent(new Event('click'));
      currencyOptions.find(option => option.dataset.currencyOption === code)!.dispatchEvent(new Event('click'));
    },
    scale(value: string) {
      const option = scaleOptions.find(option => option.value === value)!;
      scaleOptions.forEach(option => { option.checked = option.value === value; });
      option.dispatchEvent(new Event('change'));
    },
    select: (unit: string) => event('click', slots[units.indexOf(unit)].querySelector('[data-range-select]')),
    step: (unit: string) => event('click', slots[units.indexOf(unit)].querySelectorAll('')[0]),
    key: (unit: string, key: string) => event('keydown', slots[units.indexOf(unit)].querySelector('[data-range-select]'), { key }),
    pointer: (type: string, x: number, y = 18) => event(type, bar, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }),
    async ready() {
      await new Promise(resolve => setImmediate(resolve));
      for (const [id, callback] of frames) { frames.delete(id); callback(0); }
    },
    close: () => window.dispatchEvent(new Event('pagehide')),
  };
}

test('custom counts and selected range survive reload and language changes, including All time', async () => {
  const storage = new Map<string, string>();
  const first = page(storage);
  for (const unit of units.slice(0, 4)) first.step(unit);
  first.select('week');
  assert.deepEqual(JSON.parse(storage.get(key)!), { counts: { day: 2, week: 2, month: 7, year: 11 }, selected: 'week' });
  first.close();
  const restored = page(storage, 'es');
  await restored.ready();
  assert.equal(restored.slots[1].dataset.selected, 'true');
  assert.equal(restored.slots[1].querySelector('[data-range-label]').textContent, '2S');
  assert.equal(restored.slots[1].querySelector('[data-range-select]').attributes['aria-pressed'], 'true');
  assert.ok(restored.requests.some(url => url.includes('interval=60')), 'restored short range fetches candles immediately');
  assert.match(restored.root.querySelector('[data-chart-description]').textContent, /^2 semanas:/);
  restored.select('all');
  restored.close();
  const all = page(storage);
  assert.equal(all.slots[4].dataset.selected, 'true');
  assert.equal(all.slots[3].querySelector('[data-range-label]').textContent, '11Y');
  all.close();
});

test('keyboard count changes and committed pill drags persist; cancelled previews do not', () => {
  const storage = new Map<string, string>();
  const p = page(storage);
  p.select('day');
  p.key('day', 'ArrowUp');
  assert.equal(JSON.parse(storage.get(key)!).counts.day, 2);
  p.pointer('pointerdown', 50);
  p.pointer('pointermove', 150);
  assert.equal(JSON.parse(storage.get(key)!).selected, 'day');
  p.pointer('pointercancel', 150);
  assert.equal(JSON.parse(storage.get(key)!).selected, 'day');
  p.pointer('pointerdown', 50);
  p.pointer('pointermove', 250);
  p.pointer('pointerup', 250);
  assert.equal(JSON.parse(storage.get(key)!).selected, 'month');
  p.close();
});

test('vertical pill swipes wrap, persist immediately, refresh candles, and restore localized labels', async () => {
  const storage = new Map<string, string>();
  const p = page(storage);
  p.select('week');
  p.pointer('pointerdown', 150);
  p.pointer('pointermove', 150, 42);
  assert.equal(p.slots[1].querySelector('[data-range-label]').textContent, '4W');
  assert.equal(JSON.parse(storage.get(key)!).counts.week, 4);
  p.pointer('pointermove', 150, 18);
  assert.equal(JSON.parse(storage.get(key)!).counts.week, 1);
  p.pointer('pointermove', 150, -6);
  assert.equal(JSON.parse(storage.get(key)!).counts.week, 2);
  p.pointer('pointercancel', 150, -6);
  assert.equal(JSON.parse(storage.get(key)!).counts.week, 2, 'steps already shown on the chart stay committed');
  assert.ok(p.requests.some(url => url.includes('interval=60')), 'swiped weeks use the hourly candle source');
  await p.ready();
  assert.match(p.root.querySelector('[data-chart-description]').textContent, /^2 weeks:/);
  p.close();
  const restored = page(storage, 'es');
  assert.equal(restored.slots[1].dataset.selected, 'true');
  assert.equal(restored.slots[1].querySelector('[data-range-label]').textContent, '2S');
  assert.equal(restored.slots[1].querySelector('[data-range-select]').attributes['aria-label'], '2 semanas');
  restored.close();
});

test('invalid stored data falls back safely and valid counts are kept independently', () => {
  for (const value of ['bad json', 'null', '[]', '42', JSON.stringify({ counts: { day: 0, week: 5, month: 1.5, year: '3' }, selected: 'invalid' })]) {
    const storage = new Map([[key, value]]);
    const p = page(storage);
    p.select('all');
    assert.deepEqual(JSON.parse(storage.get(key)!), defaults);
    p.close();
  }
  const storage = new Map([[key, JSON.stringify({ counts: { day: 7, week: -1, month: 12 }, selected: 'day' })]]);
  const p = page(storage);
  assert.equal(p.slots[0].dataset.selected, 'true');
  p.select('day');
  assert.deepEqual(JSON.parse(storage.get(key)!), { counts: { day: 7, week: 1, month: 12, year: 10 }, selected: 'day' });
  p.close();
});

test('blocked storage and failed writes preserve working controls', async () => {
  for (const blocked of ['read', 'write'] as const) {
    const storage = new Map<string, string>();
    const p = page(storage, 'en', blocked);
    p.select('week');
    p.key('week', 'ArrowUp');
    await p.ready();
    assert.equal(p.slots[1].dataset.selected, 'true');
    assert.equal(p.slots[1].querySelector('[data-range-label]').textContent, '2W');
    assert.equal(storage.size, 0);
    p.close();
  }
});

test('the marker point follows pointer and keyboard inspection and disappears on release', async () => {
  const p = page(new Map());
  await p.ready();
  const chart = p.root.querySelector('[data-chart]');
  const marker = p.root.querySelector('[data-chart-marker]');
  const point = p.root.querySelector('[data-chart-marker-point]');
  const waves = p.root.querySelector('[data-chart-marker-waves]');
  chart.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Home' }));
  assert.equal(marker.attributes.visibility, 'visible');
  assert.equal(waves.hidden, false);
  assert.match(point.attributes.transform, /^translate\(0 /);
  assert.match(waves.style.transform, /^translate3d\(0px, /);
  chart.dispatchEvent(Object.assign(new Event('keydown'), { key: 'End' }));
  assert.match(point.attributes.transform, /^translate\(100 /);
  assert.match(waves.style.transform, /^translate3d\(100px, /);
  chart.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  assert.equal(marker.attributes.visibility, 'hidden');
  assert.equal(waves.hidden, true);
  chart.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 1, isPrimary: true, button: 0, clientX: 0 }));
  assert.equal(marker.attributes.visibility, 'visible');
  chart.dispatchEvent(Object.assign(new Event('pointermove'), { pointerId: 1, clientX: 100 }));
  assert.match(point.attributes.transform, /^translate\(100 /);
  chart.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 1 }));
  assert.equal(marker.attributes.visibility, 'hidden');
  assert.equal(waves.hidden, true);
  p.close();
});

for (const locale of Object.keys(tracker)) {
  test(`Price Tracker uses currency symbols for live prices, changes and inspection in ${locale}`, async () => {
    const p = page(new Map([['bitcoin-tracker-display', JSON.stringify({ currency: 'AUD', scale: 'linear' })]]), locale, undefined, false, undefined, 100);
    await p.ready();
    const symbols = {
      USD: '$', EUR: '€', GBP: '£', AUD: '$', CAD: '$', CHF: 'CHF', JPY: locale === 'ja' ? '￥' : '¥',
    };
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: true });
    const chart = p.root.querySelector('[data-chart]');
    const checkMoney = (rendered: string, currency: keyof typeof symbols, amount: number) => {
      assert.ok(rendered.includes(symbols[currency]), `${locale}/${currency}: ${rendered}`);
      assert.equal(rendered.replace(symbols[currency], '').trim(), number.format(amount), `${locale}/${currency}`);
    };
    checkMoney(p.root.querySelector('[data-price]').textContent, 'AUD', 8080);
    if (locale === 'es' || locale === 'it') assert.match(p.root.querySelector('[data-price]').textContent, /8\.080/);
    for (const currency of Object.keys(symbols) as (keyof typeof symbols)[]) {
      p.currency(currency);
      await p.ready();
      checkMoney(p.root.querySelector('[data-price]').textContent, currency, currency === 'USD' ? 10100 : 8080);
      const change = p.root.querySelector('[data-price-change]').textContent;
      assert.ok(change.startsWith('+'));
      checkMoney(change.slice(1).split(' (')[0], currency, currency === 'USD' ? 100 : 3080);
      chart.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Home' }));
      checkMoney(p.root.querySelector('[data-price]').textContent, currency, currency === 'USD' ? 10000 : 5000);
      chart.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
    }
    p.close();
  });
}

test('currency converts live and inspected prices and persists with scale across reloads', async () => {
  const storage = new Map<string, string>();
  const p = page(storage);
  await p.ready();
  p.currency('EUR');
  p.scale('linear');
  await p.ready();
  assert.match(p.root.querySelector('[data-price]').textContent, /81/);
  assert.equal(p.root.querySelector('[data-currency-status]').hidden, true);
  assert.match(p.root.querySelector('[data-chart]').attributes['aria-label'], /EUR/);
  assert.match(p.root.querySelector('[data-price-change]').textContent, /^\+.*31.*\(\+62%\)/);
  const chart = p.root.querySelector('[data-chart]');
  chart.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Home' }));
  assert.match(p.root.querySelector('[data-price]').textContent, /50/);
  p.close();
  assert.deepEqual(JSON.parse(storage.get('bitcoin-tracker-display')!), { scale: 'linear', currency: 'EUR' });
  const restored = page(storage);
  await restored.ready();
  assert.equal(restored.currencySelect.value, 'EUR');
  assert.equal(restored.currencyOptions.find(option => option.dataset.currencyOption === 'EUR')!.attributes['aria-selected'], 'true');
  assert.match(restored.root.querySelector('[data-chart]').attributes['aria-label'], /EUR.*Linear/);
  assert.ok(restored.requests.some(url => url.includes('frankfurter')));
  restored.close();
});

test('the price currency picker shares selection with settings and dismisses with keyboard or outside interaction', async () => {
  const storage = new Map([['bitcoin-tracker-display', JSON.stringify({ currency: 'AUD', scale: 'linear' })]]);
  const p = page(storage);
  await p.ready();
  assert.equal(p.priceCurrencyTrigger.disabled, false);
  p.priceCurrencyTrigger.dispatchEvent(new Event('click'));
  assert.equal(p.priceCurrencyList.hidden, false);
  assert.equal(p.priceCurrencyTrigger.attributes['aria-expanded'], 'true');
  assert.equal(p.priceCurrencyOptions.find(option => option.dataset.currencyOption === 'AUD')!.tabIndex, 0);
  const eur = p.priceCurrencyOptions.find(option => option.dataset.currencyOption === 'EUR')!;
  eur.dispatchEvent(new Event('click'));
  await p.ready();
  assert.equal(p.priceCurrencyList.hidden, true);
  assert.equal(p.currencySelect.value, 'EUR');
  assert.match(p.root.querySelector('[data-price]').textContent, /€/);
  assert.equal(p.currencyOptions.find(option => option.dataset.currencyOption === 'EUR')!.attributes['aria-selected'], 'true');
  assert.deepEqual(JSON.parse(storage.get('bitcoin-tracker-display')!), { currency: 'EUR', scale: 'linear' });
  p.currency('GBP');
  assert.equal(p.priceCurrencyOptions.find(option => option.dataset.currencyOption === 'GBP')!.attributes['aria-selected'], 'true');
  p.priceCurrencyTrigger.dispatchEvent(new Event('click'));
  const escape = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
  p.priceCurrencyPicker.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(p.priceCurrencyList.hidden, true);
  p.priceCurrencyTrigger.dispatchEvent(new Event('click'));
  p.document.dispatchEvent(new Event('pointerdown'));
  assert.equal(p.priceCurrencyList.hidden, true);
  p.close();
  p.priceCurrencyTrigger.dispatchEvent(new Event('click'));
  assert.equal(p.priceCurrencyList.hidden, true, 'page teardown removes the price picker listeners');
});

test('FX failures never relabel USD prices, and switching back to USD restores the chart', async () => {
  const p = page(new Map(), 'en', undefined, true);
  await p.ready();
  p.currency('JPY');
  await p.ready();
  assert.equal(p.root.querySelector('[data-price]').textContent, '—');
  assert.equal(p.root.querySelector('[data-chart-line]').attributes.d, '');
  assert.equal(p.root.querySelector('[data-currency-status]').hidden, false);
  p.currency('USD');
  await p.ready();
  assert.match(p.root.querySelector('[data-price]').textContent, /101/);
  assert.notEqual(p.root.querySelector('[data-chart-line]').attributes.d, '');
  assert.equal(p.root.querySelector('[data-currency-status]').hidden, true);
  p.close();
});

test('settings dismiss on Escape and outside interaction without changing range preferences', () => {
  const storage = new Map<string, string>();
  const p = page(storage);
  const menu = p.root.querySelector('[data-chart-settings]');
  menu.open = true;
  menu.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  assert.equal(menu.open, false);
  menu.open = true;
  p.document.dispatchEvent(Object.assign(new Event('click'), { }));
  assert.equal(menu.open, false);
  assert.equal(storage.has(key), false);
  p.close();
});

test('nested currency dismissal keeps settings open until Escape reaches the parent menu', () => {
  const p = page(new Map());
  const menu = p.root.querySelector('[data-chart-settings]');
  menu.open = true;
  p.currencyTrigger.dispatchEvent(new Event('click'));
  assert.equal(p.currencyList.hidden, false);
  const escape = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
  p.root.querySelector('[data-currency-picker]').dispatchEvent(escape);
  menu.dispatchEvent(escape);
  assert.equal(p.currencyList.hidden, true);
  assert.equal(menu.open, true);
  menu.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
  assert.equal(menu.open, false);

  menu.open = true;
  p.currencyTrigger.dispatchEvent(new Event('click'));
  assert.equal(p.root.hasAttribute('data-currency-open'), true);
  menu.open = false;
  menu.dispatchEvent(new Event('toggle'));
  assert.equal(p.currencyList.hidden, true);
  assert.equal(p.root.hasAttribute('data-currency-open'), false);
  p.close();
});

test('the currency picker keeps one selection and ignores invalid native changes', () => {
  const storage = new Map<string, string>();
  const p = page(storage);
  assert.deepEqual(p.currencyOptions.map(option => option.dataset.currencyOption), ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY']);
  assert.equal(p.currencyOptions.filter(option => option.attributes['aria-selected'] === 'true').length, 1);
  p.currency('EUR');
  p.currencySelect.value = 'invalid';
  p.currencySelect.dispatchEvent(new Event('change'));
  assert.equal(JSON.parse(storage.get('bitcoin-tracker-display')!).currency, 'EUR');
  p.currencySelect.value = 'EUR';
  p.currencySelect.dispatchEvent(new Event('change'));
  assert.equal(p.currencyOptions.filter(option => option.attributes['aria-selected'] === 'true').length, 1);
  p.close();
});

test('scale selection keeps settings open and currency selection returns focus to its trigger', async () => {
  const storage = new Map<string, string>();
  const p = page(storage, 'en', undefined, false, 'fx');
  await p.ready();
  const menu = p.root.querySelector('[data-chart-settings]');
  const trigger = p.root.querySelector('[data-settings-trigger]');
  let focused = false;
  trigger.focus = () => { focused = true; };
  menu.open = true;
  p.scale('linear');
  assert.equal(menu.open, true);
  assert.equal(focused, false);
  focused = false;
  p.currencyTrigger.focus = () => { focused = true; };
  p.currency('EUR');
  assert.equal(p.currencyList.hidden, true);
  assert.equal(focused, true);
  assert.deepEqual(JSON.parse(storage.get('bitcoin-tracker-display')!), { scale: 'linear', currency: 'EUR' });
  await p.ready();
  assert.equal(p.root.querySelector('[data-chart-loading]').hidden, false);
  focused = false;
  p.currency('EUR');
  assert.equal(p.currencyList.hidden, true);
  assert.equal(focused, true);
  p.releaseRequests();
  await p.ready();
  p.close();
});

test('FX loading uses one spinner instead of visible loading messages and stops on success or failure', async () => {
  for (const failed of [false, true]) {
    const p = page(new Map(), 'en', undefined, failed, 'fx');
    await p.ready();
    p.currency('EUR');
    await p.ready();
    assert.equal(p.root.querySelector('[data-chart-loading]').hidden, false);
    assert.equal(p.root.querySelector('[data-loading-description]').textContent, 'Loading exchange rates');
    assert.equal(p.root.querySelector('[data-currency-status]').hidden, true);
    assert.equal(p.root.querySelector('[data-history-status]').hidden, true);
    assert.equal(p.root.querySelector('[data-chart]').attributes['aria-busy'], 'true');
    p.releaseRequests();
    await p.ready();
    assert.equal(p.root.querySelector('[data-chart-loading]').hidden, true);
    assert.equal(p.root.querySelector('[data-currency-status]').hidden, !failed);
    assert.equal(p.root.querySelector('[data-chart]').attributes['aria-busy'], 'false');
    p.close();
  }
});

test('an uncached range shows the spinner while candles load and hides it when the chart is ready', async () => {
  const p = page(new Map(), 'en', undefined, false, 'candles');
  await p.ready();
  p.select('day');
  await p.ready();
  assert.equal(p.root.querySelector('[data-chart-loading]').hidden, false);
  assert.equal(p.root.querySelector('[data-loading-description]').textContent, 'Loading price history');
  assert.equal(p.root.querySelector('[data-history-status]').hidden, true);
  p.releaseRequests();
  await p.ready();
  assert.equal(p.root.querySelector('[data-chart-loading]').hidden, true);
  p.close();
});

test('explicit scale choices restore the saved mode and keep settings open when changed', () => {
  const storage = new Map<string, string>();
  const p = page(storage);
  const menu = p.root.querySelector('[data-chart-settings]');
  menu.open = true;
  assert.equal(p.scaleOptions.find(option => option.checked)?.value, 'logarithmic');
  p.scale('linear');
  assert.equal(p.scaleOptions.find(option => option.checked)?.value, 'linear');
  assert.equal(menu.open, true);
  assert.equal(JSON.parse(storage.get('bitcoin-tracker-display')!).scale, 'linear');
  p.close();

  const restored = page(storage);
  assert.equal(restored.scaleOptions.find(option => option.checked)?.value, 'linear');
  restored.scale('logarithmic');
  assert.equal(JSON.parse(storage.get('bitcoin-tracker-display')!).scale, 'logarithmic');
  restored.close();
});
