import assert from 'node:assert/strict';
import test from 'node:test';
import { browserModule } from './support/browser-module.ts';

const preferenceKey = 'bitcoin-tracker-price-tab';
const refreshKey = 'bitcoin-tracker-price-tab-refresh';

function harness(storage = new Map([[preferenceKey, 'true']])) {
  const controls = new Map<string, Control>();
  class Control extends EventTarget {
    value = '';
    hidden = false;
    open = false;
    disabled = false;
    attributes = new Map<string, string>();
    querySelector(selector: string): Control {
      if (!controls.has(selector)) controls.set(selector, new Control());
      return controls.get(selector)!;
    }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    querySelectorAll() { return []; }
    focus() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
  }
  const root = new Control();
  const document = Object.assign(new EventTarget(), { title: 'Price Chart — Open Bitcoin Tracker' });
  const timeouts = new Map<number, { at: number; run: () => void }>();
  let now = 1_000_000;
  let nextId = 0;
  const globals = {
    document, Event, Date: { now: () => now },
    window: { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } },
    setTimeout(run: () => void, delay: number) { const id = ++nextId; timeouts.set(id, { run, at: now + delay }); return id; },
    clearTimeout(id: number) { timeouts.delete(id); },
  };
  const { createPriceTabTitle } = browserModule('lib/price-tab-title', globals, browserModule('lib/currency-picker', globals));
  const title = createPriceTabTitle(root);
  const control = (selector: string) => controls.get(selector)!;
  const advance = (ms: number) => {
    const target = now + ms;
    while (true) {
      const next = [...timeouts.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      now = next[1].at;
      timeouts.delete(next[0]);
      next[1].run();
    }
    now = target;
  };
  return { title, document, storage, timeouts, advance, control,
    click(selector: string) { control(selector).dispatchEvent(new Event('click')); },
    changeInterval(value: string) { control('[data-price-tab-refresh]').value = value; control('[data-price-tab-refresh]').dispatchEvent(new Event('change')); },
  };
}

test('the tab-price switch reflects confirmed choices and keeps settings open when switched off', () => {
  const h = harness(new Map());
  const toggle = h.control('[data-price-tab-toggle]');
  const menu = h.control('[data-chart-settings]');
  const refresh = h.control('[data-price-tab-refresh-row]');
  assert.equal(toggle.attributes.get('aria-checked'), 'false');
  assert.equal(refresh.hidden, true);
  menu.open = true;
  h.click('[data-price-tab-toggle]');
  assert.equal(menu.open, false);
  assert.equal(toggle.attributes.get('aria-checked'), 'false', 'opening the explanation does not enable the switch');
  h.click('[data-price-tab-cancel]');
  assert.equal(toggle.attributes.get('aria-checked'), 'false');
  h.click('[data-price-tab-toggle]');
  h.click('[data-price-tab-confirm]');
  assert.equal(toggle.attributes.get('aria-checked'), 'true');
  assert.equal(refresh.hidden, false);
  menu.open = true;
  h.click('[data-price-tab-toggle]');
  assert.equal(toggle.attributes.get('aria-checked'), 'false');
  assert.equal(refresh.hidden, true);
  assert.equal(menu.open, true);
  h.title.destroy();
});

test('each supported refresh interval coalesces ticks into the latest price at its deadline', () => {
  for (const seconds of [1, 5, 15, 30, 60]) {
    const h = harness(new Map([[preferenceKey, 'true'], [refreshKey, String(seconds)]]));
    assert.equal(h.control('[data-price-tab-refresh]').value, String(seconds));
    h.title.update('£64,250');
    assert.equal(h.document.title, '£64,250', 'the first live price is immediate');
    h.title.update('£64,251');
    h.title.update('£64,252');
    assert.equal(h.timeouts.size, 1);
    h.advance(seconds * 1000 - 1);
    assert.equal(h.document.title, '£64,250');
    h.advance(1);
    assert.equal(h.document.title, '£64,252');
    assert.equal(h.timeouts.size, 0);
    h.title.update('£64,252');
    assert.equal(h.timeouts.size, 0, 'an unchanged rounded price needs no timer');
    h.title.destroy();
  }
});

test('currency changes, missing data, disabling, and cleanup bypass the interval and cancel pending prices', () => {
  const h = harness(new Map([[preferenceKey, 'true'], [refreshKey, '60']]));
  h.title.update('£64,250');
  h.title.update('£64,251');
  h.title.update('€76,500', true);
  assert.equal(h.document.title, '€76,500');
  assert.equal(h.timeouts.size, 0);
  h.title.update('€76,501');
  h.title.update();
  assert.equal(h.document.title, 'Price Chart — Open Bitcoin Tracker');
  assert.equal(h.timeouts.size, 0);
  h.advance(60_000);
  assert.equal(h.document.title, 'Price Chart — Open Bitcoin Tracker');
  h.title.update('€76,502');
  assert.equal(h.document.title, '€76,502', 'recovered live data appears immediately');
  h.title.update('€76,503');
  h.click('[data-price-tab-toggle]');
  assert.equal(h.document.title, 'Price Chart — Open Bitcoin Tracker');
  assert.equal(h.timeouts.size, 0);
  assert.equal(h.control('[data-price-tab-refresh-row]').hidden, true);
  h.click('[data-price-tab-toggle]');
  h.click('[data-price-tab-confirm]');
  h.title.update('€76,504');
  assert.equal(h.timeouts.size, 1);
  h.title.destroy();
  assert.equal(h.timeouts.size, 0);
  h.advance(60_000);
  assert.equal(h.document.title, 'Price Chart — Open Bitcoin Tracker');
});

test('the panel saves its chosen interval only on confirmation, and the menu can update it later', () => {
  const storage = new Map([[preferenceKey, 'false'], [refreshKey, '15']]);
  const h = harness(storage);
  h.title.update('£64,250');
  h.click('[data-price-tab-toggle]');
  assert.equal(h.control('[data-price-tab-dialog-refresh]').value, '15');
  h.control('[data-price-tab-dialog-refresh]').value = '30';
  h.click('[data-price-tab-cancel]');
  assert.equal(storage.get(refreshKey), '15');
  assert.equal(storage.get(preferenceKey), 'false');
  h.click('[data-price-tab-toggle]');
  assert.equal(h.control('[data-price-tab-dialog-refresh]').value, '15');
  h.control('[data-price-tab-dialog-refresh]').value = '30';
  h.click('[data-price-tab-confirm]');
  assert.equal(h.document.title, '£64,250');
  assert.equal(storage.get(refreshKey), '30');
  assert.equal(h.control('[data-price-tab-refresh]').value, '30');
  assert.equal(h.control('[data-price-tab-refresh-row]').hidden, false);
  h.title.update('£64,251');
  h.changeInterval('5');
  assert.equal(h.document.title, '£64,251', 'changing the interval shows the latest price immediately');
  assert.equal(h.timeouts.size, 0);
  assert.equal(storage.get(refreshKey), '5');
  h.title.update('£64,252');
  h.advance(4999);
  assert.equal(h.document.title, '£64,251');
  h.advance(1);
  assert.equal(h.document.title, '£64,252');
  const reloaded = harness(storage);
  assert.equal(reloaded.control('[data-price-tab-refresh]').value, '5');
  assert.equal(reloaded.title.enabled, true);
  reloaded.title.destroy();
  h.title.destroy();
});

test('invalid saved intervals use one second and invalid control values preserve the current interval', () => {
  for (const value of ['0', '-1', '2', 'Infinity', '"5"', '5.0']) {
    const h = harness(new Map([[preferenceKey, 'true'], [refreshKey, value]]));
    assert.equal(h.control('[data-price-tab-refresh]').value, '1');
    h.changeInterval('15');
    h.changeInterval('invalid');
    assert.equal(h.control('[data-price-tab-refresh]').value, '15');
    assert.equal(h.storage.get(refreshKey), '15');
    h.title.destroy();
  }
});
