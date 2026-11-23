import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { browserModule } from './support/browser-module.ts';

const key = 'bitcoin-tracker-display';
const isCurrency = (code: string) => ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY'].includes(code);

function page(storage = new Map<string, string>(), blocked?: 'read' | 'write') {
  let writes = 0;
  const document = Object.assign(new EventTarget(), { hidden: false });
  const localStorage = {
    getItem(key: string) { if (blocked === 'read') throw Error('Blocked'); return storage.get(key) ?? null; },
    setItem(key: string, value: string) { if (blocked) throw Error('Blocked'); writes++; storage.set(key, value); },
  };
  const window = Object.assign(new EventTarget(), { localStorage });
  const globals = { window, document, Event };
  const preferences = browserModule('lib/bitcoin-display-preferences', globals, { isCurrency });
  return { ...globals, storage, preferences, writes: () => writes,
    storageEvent(name: string | null = key, storageArea = localStorage) {
      window.dispatchEvent(Object.assign(new Event('storage'), { key: name, storageArea }));
    },
    visibility(hidden: boolean) { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('display preferences validate stored currency and remain usable without storage', () => {
  for (const value of [undefined, 'invalid JSON', '{}', '{"currency":"invalid"}']) {
    const h = page(value === undefined ? new Map() : new Map([[key, value]]));
    assert.equal(h.preferences.readDisplayPreferences().currency, 'USD');
  }
  for (const blocked of ['read', 'write'] as const) {
    const h = page(new Map([[key, '{"currency":"EUR","scale":"linear"}']]), blocked);
    const changes: string[] = [];
    const stop = h.preferences.subscribeCurrencyPreference((code: string) => changes.push(code));
    h.preferences.saveDisplayPreferences({ currency: 'GBP', scale: 'linear' });
    assert.equal(h.preferences.readDisplayPreferences().currency, 'GBP');
    assert.deepEqual(changes, ['GBP']);
    assert.equal(h.writes(), 0);
    stop();
  }
});

test('same-page subscribers receive currency changes once, ignore scale changes and clean up', () => {
  const h = page();
  const changes: string[][] = [[], []];
  const stops = changes.map(values => h.preferences.subscribeCurrencyPreference((code: string) => values.push(code)));
  h.preferences.saveDisplayPreferences({ currency: 'EUR', scale: 'linear' });
  h.preferences.saveDisplayPreferences({ currency: 'EUR', scale: 'logarithmic' });
  assert.deepEqual(changes, [['EUR'], ['EUR']]);
  stops.forEach(stop => stop());
  h.preferences.saveDisplayPreferences({ currency: 'GBP', scale: 'linear' });
  h.storageEvent();
  h.window.dispatchEvent(new Event('pageshow'));
  h.visibility(false);
  assert.deepEqual(changes, [['EUR'], ['EUR']]);
});

test('other tabs follow global currency without writing back, including storage removal and clearing', () => {
  const storage = new Map<string, string>();
  const first = page(storage);
  const second = page(storage);
  const changes: string[] = [];
  const stop = second.preferences.subscribeCurrencyPreference((code: string) => changes.push(code));
  first.preferences.saveDisplayPreferences({ currency: 'JPY', scale: 'linear' });
  second.storageEvent('unrelated');
  second.storageEvent(key, { getItem: () => null, setItem() {} });
  assert.deepEqual(changes, []);
  second.storageEvent();
  second.storageEvent();
  assert.deepEqual(changes, ['JPY']);
  storage.delete(key);
  second.storageEvent();
  first.preferences.saveDisplayPreferences({ currency: 'GBP', scale: 'linear' });
  second.storageEvent();
  storage.clear();
  second.storageEvent(null);
  assert.deepEqual(changes, ['JPY', 'USD', 'GBP', 'USD']);
  assert.equal(second.writes(), 0);
  stop();
});

test('cached and background pages resync the stored currency when shown', () => {
  const h = page();
  const changes: string[] = [];
  const stop = h.preferences.subscribeCurrencyPreference((code: string) => changes.push(code));
  h.storage.set(key, '{"currency":"EUR"}');
  h.window.dispatchEvent(new Event('pageshow'));
  h.visibility(true);
  h.storage.set(key, '{"currency":"GBP"}');
  assert.deepEqual(changes, ['EUR']);
  h.visibility(false);
  assert.deepEqual(changes, ['EUR', 'GBP']);
  assert.equal(h.writes(), 0);
  stop();
});

test('live price displays share currency immediately and update external tabs without overwriting their scale', async () => {
  const storage = new Map([[key, '{"currency":"USD","scale":"linear"}']]);
  const first = page(storage);
  const second = page(storage);
  function display(h: ReturnType<typeof page>) {
    class Element extends EventTarget {
      value = ''; disabled = true; textContent = ''; style = { setProperty() {} };
      setAttribute() {} removeAttribute() {}
    }
    const select = new Element();
    const price = new Element();
    const status = new Element();
    const root = { querySelector: (selector: string) => selector === '[data-currency]' ? select : selector === '[data-price]' ? price : status };
    const globals = { ...h, navigator: { onLine: true }, Intl, setInterval: () => 1, clearInterval() {} };
    const modules = { ...h.preferences, isCurrency, createRollingNumber: () => undefined,
      CurrencyRates: class {
        current(code: string) { return code === 'USD' ? { rate: 1 } : code === 'EUR' ? { rate: .9 } : undefined; }
        async refreshLatest() {}
      },
      subscribeBitcoinPrice(callbacks: { onPrice(point: { price: number; time: number }): void }) {
        callbacks.onPrice({ price: 100_000, time: Date.now() });
        return () => {};
      },
    };
    const { createLivePriceDisplay } = browserModule('lib/live-price-display', globals, modules);
    const live = createLivePriceDisplay(root, { locale: 'en', copy: { unavailable: 'Unavailable', live: 'Live', fxUnavailable: 'No FX' } });
    live.start();
    return { select, price, live };
  }
  const a = display(first);
  const b = display(first);
  const c = display(second);
  a.select.value = 'EUR';
  a.select.dispatchEvent(new Event('change'));
  assert.equal(b.select.value, 'EUR');
  assert.equal(b.price.textContent, '€90,000');
  assert.equal(first.writes(), 1, 'other displays do not save the change again');
  second.storageEvent();
  assert.equal(c.select.value, 'EUR');
  assert.equal(c.price.textContent, '€90,000');
  assert.equal(second.writes(), 0);
  assert.equal(JSON.parse(storage.get(key)!).scale, 'linear');
  first.preferences.saveDisplayPreferences({ currency: 'JPY', scale: 'linear' });
  await setImmediate();
  assert.equal(b.price.textContent, '—', 'missing FX cannot leave the old currency displayed');
  for (const item of [a, b, c]) item.live.destroy();
  first.preferences.saveDisplayPreferences({ currency: 'USD', scale: 'linear' });
  assert.equal(b.select.value, 'JPY', 'destroyed displays unsubscribe');
});

test('a price with a rolling layer rolls live ticks in their direction and snaps first prices and currency changes', () => {
  const h = page();
  class Element extends EventTarget {
    value = ''; disabled = true; textContent = ''; style = { setProperty() {} };
    attributes = new Map<string, string>();
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
  }
  const select = new Element();
  const status = new Element();
  const text = new Element();
  const layer = new Element();
  let isStatic = false;
  const price = Object.assign(new Element(), { querySelector: (selector: string) => selector === '[data-price-roll]' ? layer : text, closest: (selector: string) => selector === '[data-price-static]' && isStatic ? {} : null });
  const root = { querySelector: (selector: string) => selector === '[data-currency]' ? select : selector === '[data-price]' ? price : status };
  let reduce = false;
  const window = Object.assign(h.window, { matchMedia: () => ({ get matches() { return reduce; } }) });
  const rolls: { text: string; direction?: number; animate?: boolean }[] = [];
  let tick = (_price: number) => {};
  const modules = { ...h.preferences, isCurrency,
    createRollingNumber: (target: unknown) => target === layer ? { set: (value: string, options: { direction?: number; animate?: boolean }) => rolls.push({ text: value, ...options }) } : undefined,
    CurrencyRates: class {
      current(code: string) { return code === 'USD' ? { rate: 1 } : code === 'EUR' ? { rate: .5 } : undefined; }
      async refreshLatest() {}
    },
    subscribeBitcoinPrice(callbacks: { onPrice(point: { price: number; time: number }): void }) {
      tick = price => callbacks.onPrice({ price, time: Date.now() });
      return () => {};
    },
  };
  const globals = { ...h, window, navigator: { onLine: true }, Intl, setInterval: () => 1, clearInterval() {} };
  const { createLivePriceDisplay } = browserModule('lib/live-price-display', globals, modules);
  const live = createLivePriceDisplay(root, { locale: 'en', copy: { unavailable: 'Unavailable', live: 'Live', fxUnavailable: 'No FX' } });
  live.start();
  assert.equal(price.attributes.has('data-price-rolling'), true);
  const last = () => rolls.at(-1)!;
  tick(100_000);
  assert.equal(text.textContent, '$100,000', 'the real text stays underneath for layout and accessibility');
  assert.deepEqual(last(), { text: '$100,000', direction: 1, animate: false }, 'the first price snaps');
  tick(100_050);
  assert.deepEqual(last(), { text: '$100,050', direction: 1, animate: true });
  tick(99_990);
  assert.deepEqual(last(), { text: '$99,990', direction: -1, animate: true });
  select.value = 'EUR';
  select.dispatchEvent(new Event('change'));
  assert.deepEqual(last(), { text: '€49,995', direction: -1, animate: false }, 'a currency change snaps');
  isStatic = true;
  tick(99_000);
  assert.equal(last().animate, false, 'a page that switched rolling off snaps');
  isStatic = false;
  tick(99_500);
  assert.equal(last().animate, true);
  reduce = true;
  tick(100_000);
  assert.equal(last().animate, false, 'reduced motion snaps');
  live.destroy();
});
