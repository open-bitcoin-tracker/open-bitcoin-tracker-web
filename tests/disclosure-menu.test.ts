import assert from 'node:assert/strict';
import test from 'node:test';
import { browserModule } from './support/browser-module.ts';

function harness({ navigate = false, closeOnSelect = false } = {}) {
  const document = Object.assign(new EventTarget(), { activeElement: null as Item | null });
  class Item extends EventTarget {
    attributes = new Map<string, string>();
    textContent = '';
    focusCount = 0;
    hasAttribute(name: string) { return this.attributes.has(name); }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    matches() { return this.attributes.get('aria-pressed') === 'true'; }
    focus() { this.focusCount++; document.activeElement = this; document.dispatchEvent(new Event('focusin')); }
  }
  const trigger = new Item();
  trigger.setAttribute('aria-expanded', 'false');
  const options = ['USD', 'EUR', 'GBP'].map(textContent => Object.assign(new Item(), { textContent }));
  options[1].setAttribute('aria-pressed', 'true');
  const menu = Object.assign(new Item(), {
    open: false,
    querySelector: () => trigger,
    querySelectorAll: () => options,
    contains: (target: unknown) => target === trigger || target === menu || options.includes(target as Item),
  });
  if (navigate) menu.setAttribute('data-menu-navigation', '');
  if (closeOnSelect) menu.setAttribute('data-menu-close-on-select', '');
  const controller = browserModule('lib/disclosure-menu', { document }).createDisclosureMenu(menu);
  function key(key: string) {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key });
    menu.dispatchEvent(event);
    return event;
  }
  return { menu, trigger, options, document, controller, key };
}

test('Escape closes the disclosure, consumes the key, and restores focus', () => {
  const h = harness();
  h.menu.open = true;
  h.options[0].focus();
  assert.equal(h.key('Escape').defaultPrevented, true);
  assert.equal(h.menu.open, false);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.trigger.attributes.get('aria-expanded'), 'false');
  assert.equal(h.key('Escape').defaultPrevented, false, 'closed menus leave Escape to their parent');
});

test('outside interaction closes without stealing focus, while focus inside stays open', () => {
  const h = harness();
  h.menu.open = true;
  h.options[0].focus();
  assert.equal(h.menu.open, true);
  h.document.activeElement = null;
  h.document.dispatchEvent(new Event('focusin'));
  assert.equal(h.menu.open, false);
  assert.equal(h.trigger.focusCount, 0);
  h.menu.open = true;
  h.document.dispatchEvent(new Event('click'));
  assert.equal(h.menu.open, false);
});

test('optional keyboard navigation opens on the selection and wraps without committing', () => {
  const h = harness({ navigate: true });
  h.trigger.focus();
  h.key('ArrowDown');
  assert.equal(h.menu.open, true);
  assert.equal(h.document.activeElement, h.options[1]);
  h.key('End'); h.key('ArrowDown');
  assert.equal(h.document.activeElement, h.options[0]);
  h.key('g');
  assert.equal(h.document.activeElement, h.options[2]);
  assert.equal(h.options[1].attributes.get('aria-pressed'), 'true');
});

test('selection dismissal is optional and destroy removes enhancement listeners', () => {
  const h = harness({ closeOnSelect: true });
  h.menu.open = true;
  h.options[0].dispatchEvent(new Event('click'));
  assert.equal(h.menu.open, false);
  assert.equal(h.document.activeElement, h.trigger);
  h.controller.destroy();
  h.menu.open = true;
  h.document.dispatchEvent(new Event('click'));
  h.key('Escape');
  assert.equal(h.menu.open, true);
});
