import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { createVideoCurrencyPicker } from '../src/lib/video-currency-picker.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/video-currency-picker.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ currency = 'USD', disabled = false, standalone = false } = {}) {
  class Element extends EventTarget {
    attributes = new Map<string, string>();
    dataset: Record<string, string> = {};
    selectors = new Map<string, Element>();
    children: Element[] = [];
    parent: Element | null = null;
    hidden = false;
    disabled = false;
    tabIndex = -1;
    value = '';
    textContent = '';
    focusCount = 0;
    listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
      super.addEventListener(type, callback, options);
      if (!callback) return;
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(callback);
    }
    removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
      super.removeEventListener(type, callback, options);
      if (callback) this.listeners.get(type)?.delete(callback);
    }
    listenerCount() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    hasAttribute(name: string) { return this.attributes.has(name); }
    querySelector(selector: string) { return this.selectors.get(selector) ?? null; }
    querySelectorAll(selector: string) { assert.equal(selector, '[data-currency-option]'); return this.children; }
    contains(target: Element | null): boolean { return target === this || this.children.some(child => child.contains(target)); }
    focus() {
      this.focusCount++;
      document.activeElement = this;
      document.dispatchEvent(eventFor('focusin', this));
    }
    click() { this.dispatchEvent(new Event('click')); }
    append(child: Element) { child.parent = this; this.children.push(child); return child; }
  }
  function eventFor(type: string, target: Element) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    return event;
  }
  const root = new Element();
  const wrapper = root.append(new Element());
  const trigger = wrapper.append(new Element());
  const value = trigger.append(new Element());
  const panel = standalone ? wrapper.append(new Element()) : undefined;
  const back = panel?.append(new Element());
  const list = (panel ?? wrapper).append(new Element());
  const select = wrapper.append(new Element());
  const outside = new Element();
  const document = Object.assign(new Element(), { activeElement: null as Element | null });
  const options = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY'].map(currency => {
    const option = list.append(new Element());
    option.dataset.currencyOption = currency;
    return option;
  });
  root.selectors.set('[data-currency-picker]', wrapper);
  wrapper.selectors.set('[data-currency-trigger]', trigger);
  wrapper.selectors.set('[data-currency-value]', value);
  wrapper.selectors.set('[data-currency-list]', list);
  select.value = currency;
  select.disabled = disabled;
  trigger.disabled = true;
  list.hidden = true;
  const changes: { currency: string; bubbles: boolean }[] = [];
  let toggles = 0;
  let now = 1000;
  select.addEventListener('change', event => changes.push({ currency: select.value, bubbles: event.bubbles }));
  root.addEventListener('currencytoggle', () => { toggles++; });
  const module: { createVideoCurrencyPicker?: typeof createVideoCurrencyPicker } = {};
  runInNewContext(script, { exports: module, document, Event, Date: { now: () => now } });
  const picker = module.createVideoCurrencyPicker!(root as unknown as HTMLElement, select as unknown as HTMLSelectElement, { panel: panel as unknown as HTMLElement, back: back as unknown as HTMLButtonElement });
  const option = (currency: string) => options.find(option => option.dataset.currencyOption === currency)!;
  return {
    root, wrapper, trigger, value, list, select, options, document, outside, changes, picker, option, panel, back,
    toggles: () => toggles,
    advance(milliseconds: number) { now += milliseconds; },
    focused: () => document.activeElement?.dataset.currencyOption,
    key(target: Element, key: string, modifiers: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey'>> = {}) {
      const event = Object.assign(eventFor('keydown', target), { key, ...modifiers });
      wrapper.dispatchEvent(event);
      return event.defaultPrevented;
    },
    pointer(target: Element) { document.dispatchEvent(eventFor('pointerdown', target)); },
    nativeCurrency(currency: string) { select.value = currency; select.dispatchEvent(new Event('change', { bubbles: true })); },
  };
}

test('the currency picker restores the native select and stays synchronized with currency and disabled changes', () => {
  const h = harness({ currency: 'GBP' });
  assert.equal(h.trigger.disabled, false);
  assert.equal(h.value.textContent, 'GBP');
  assert.equal(h.list.hidden, true);
  assert.equal(h.trigger.attributes.get('aria-expanded'), 'false');
  assert.equal(h.root.attributes.has('data-currency-open'), false);
  for (const option of h.options) {
    assert.equal(option.attributes.get('aria-selected'), String(option.dataset.currencyOption === 'GBP'));
    assert.equal(option.tabIndex, -1);
  }
  h.nativeCurrency('EUR');
  assert.equal(h.value.textContent, 'EUR');
  assert.equal(h.option('EUR').attributes.get('aria-selected'), 'true');
  assert.equal(h.option('GBP').attributes.get('aria-selected'), 'false');
  h.select.disabled = true;
  h.select.dispatchEvent(new Event('change'));
  assert.equal(h.trigger.disabled, true);
  h.trigger.click();
  assert.equal(h.list.hidden, true);
  h.picker.destroy();

  const disabled = harness({ disabled: true });
  disabled.trigger.click();
  assert.equal(disabled.trigger.disabled, true);
  assert.equal(disabled.list.hidden, true);
  disabled.picker.destroy();
});

test('opening focuses the selected currency and clicking an option commits a bubbling native change', () => {
  const h = harness({ currency: 'GBP' });
  h.trigger.click();
  assert.equal(h.focused(), 'GBP');
  assert.equal(h.list.hidden, false);
  assert.equal(h.trigger.attributes.get('aria-expanded'), 'true');
  assert.equal(h.root.attributes.has('data-currency-open'), true);
  assert.equal(h.option('GBP').tabIndex, 0);
  h.option('EUR').click();
  assert.deepEqual(h.changes, [{ currency: 'EUR', bubbles: true }]);
  assert.equal(h.select.value, 'EUR');
  assert.equal(h.value.textContent, 'EUR');
  assert.equal(h.list.hidden, true);
  assert.equal(h.root.attributes.has('data-currency-open'), false);
  assert.equal(h.trigger.attributes.get('aria-expanded'), 'false');
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.toggles(), 2);
  assert.equal(h.options.every(option => option.tabIndex === -1), true);
  h.picker.destroy();
});

test('arrows and Home/End move through options without changing currency until Enter or Space commits', () => {
  const h = harness();
  assert.equal(h.key(h.trigger, 'ArrowDown'), true);
  assert.equal(h.focused(), 'USD');
  h.key(h.option('USD'), 'ArrowDown');
  assert.equal(h.focused(), 'EUR');
  assert.equal(h.select.value, 'USD');
  assert.equal(h.option('USD').attributes.get('aria-selected'), 'true');
  h.key(h.option('EUR'), 'End');
  assert.equal(h.focused(), 'JPY');
  h.key(h.option('JPY'), 'ArrowDown');
  assert.equal(h.focused(), 'USD');
  h.key(h.option('USD'), 'ArrowUp');
  assert.equal(h.focused(), 'JPY');
  h.key(h.option('JPY'), 'Home');
  assert.equal(h.focused(), 'USD');
  h.key(h.option('USD'), 'ArrowDown');
  assert.equal(h.key(h.option('EUR'), 'Enter'), true);
  assert.equal(h.select.value, 'EUR');
  assert.equal(h.list.hidden, true);
  h.key(h.trigger, 'End');
  assert.equal(h.key(h.option('JPY'), ' '), true);
  assert.equal(h.select.value, 'JPY');
  assert.deepEqual(h.changes.map(change => change.currency), ['EUR', 'JPY']);
  h.picker.destroy();
});

test('Escape discards focused alternatives and restores the trigger without changing currency', () => {
  const h = harness();
  h.trigger.click();
  h.key(h.option('USD'), 'ArrowDown');
  assert.equal(h.focused(), 'EUR');
  assert.equal(h.key(h.option('EUR'), 'Escape'), true);
  assert.equal(h.select.value, 'USD');
  assert.equal(h.value.textContent, 'USD');
  assert.equal(h.changes.length, 0);
  assert.equal(h.list.hidden, true);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.key(h.trigger, 'Escape'), false);
  h.picker.destroy();
});

test('currency-code typeahead opens and focuses matching codes and repeats cycle through shared prefixes', () => {
  const h = harness();
  assert.equal(h.key(h.trigger, 'g'), true);
  assert.equal(h.focused(), 'GBP');
  h.key(h.option('GBP'), 'b');
  assert.equal(h.focused(), 'GBP');
  h.advance(1000);
  h.key(h.option('GBP'), 'c');
  assert.equal(h.focused(), 'CAD');
  h.key(h.option('CAD'), 'c');
  assert.equal(h.focused(), 'CHF');
  h.key(h.option('CHF'), 'c');
  assert.equal(h.focused(), 'CAD');
  assert.equal(h.key(h.option('CAD'), 'x'), false);
  assert.equal(h.key(h.option('CAD'), 'g', { ctrlKey: true }), false);
  assert.equal(h.select.value, 'USD');
  assert.equal(h.changes.length, 0);
  h.picker.destroy();
});

test('outside pointer and focus dismiss the menu without stealing focus, and Tab retains native navigation', () => {
  const h = harness();
  h.trigger.click();
  h.pointer(h.option('USD'));
  assert.equal(h.list.hidden, false);
  const triggerFocus = h.trigger.focusCount;
  h.pointer(h.outside);
  assert.equal(h.list.hidden, true);
  assert.equal(h.trigger.focusCount, triggerFocus);
  h.trigger.click();
  assert.equal(h.key(h.option('USD'), 'Tab'), false);
  h.outside.focus();
  assert.equal(h.list.hidden, true);
  assert.equal(h.document.activeElement, h.outside);
  assert.equal(h.select.value, 'USD');
  h.picker.destroy();
});

test('destroy closes an open currency menu once and removes all helper listeners', () => {
  const h = harness();
  h.trigger.click();
  h.picker.destroy();
  h.picker.destroy();
  assert.equal(h.list.hidden, true);
  assert.equal(h.root.attributes.has('data-currency-open'), false);
  assert.equal(h.toggles(), 2);
  for (const element of [h.trigger, h.wrapper, h.document, ...h.options]) assert.equal(element.listenerCount(), 0);
  assert.equal(h.select.listenerCount(), 1, 'the page currency controller listener is preserved');
  h.trigger.click();
  h.key(h.trigger, 'ArrowDown');
  h.option('EUR').click();
  h.pointer(h.outside);
  h.nativeCurrency('GBP');
  assert.equal(h.list.hidden, true);
  assert.equal(h.toggles(), 2);
  assert.equal(h.value.textContent, 'USD');
});

test('opening price styling closes the currency menu', () => {
  const h = harness();
  h.trigger.click();
  h.root.setAttribute('data-price-style-open', '');
  h.root.dispatchEvent(new Event('pricestyletoggle'));
  assert.equal(h.list.hidden, true);
  assert.equal(h.root.attributes.has('data-currency-open'), false);
  h.picker.destroy();
});

test('a separate currency panel opens on the saved choice and returns to settings on back or selection', () => {
  const h = harness({ currency: 'GBP', standalone: true });
  assert.equal(h.panel!.hidden, true);
  h.trigger.click();
  assert.equal(h.panel!.hidden, false);
  assert.equal(h.focused(), 'GBP');
  h.back!.click();
  assert.equal(h.panel!.hidden, true);
  assert.equal(h.list.hidden, true);
  assert.equal(h.root.hasAttribute('data-currency-open'), false);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.changes.length, 0);

  h.trigger.click();
  h.option('EUR').click();
  assert.equal(h.panel!.hidden, true);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.value.textContent, 'EUR');
  h.picker.destroy();
  assert.equal(h.back!.listenerCount(), 0);
});

test('a shared settings wrapper ignores other controls and dismisses a separate panel on Escape or outside focus', () => {
  const h = harness({ standalone: true });
  assert.equal(h.key(h.select, 'ArrowDown'), false);
  assert.equal(h.panel!.hidden, true);
  h.trigger.click();
  assert.equal(h.key(h.back!, 'Escape'), true);
  assert.equal(h.panel!.hidden, true);
  assert.equal(h.document.activeElement, h.trigger);
  h.trigger.click();
  h.outside.focus();
  assert.equal(h.panel!.hidden, true);
  assert.equal(h.document.activeElement, h.outside);
  assert.equal(h.root.hasAttribute('data-currency-open'), false);
  h.picker.destroy();
});


test('hiding the interface closes currency without moving focus into hidden controls', () => {
  const h = harness();
  h.trigger.click();
  const focusCount = h.trigger.focusCount;
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.list.hidden, true);
  assert.equal(h.root.hasAttribute('data-currency-open'), false);
  assert.equal(h.trigger.focusCount, focusCount);
  h.picker.destroy();
});
