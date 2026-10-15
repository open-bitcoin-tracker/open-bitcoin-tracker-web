import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { createVideoPriceStyle } from '../src/lib/video-price-style.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/video-price-style.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ saved, blocked = false }: { saved?: string; blocked?: boolean } = {}) {
  class Element extends EventTarget {
    attributes = new Map<string, string>();
    dataset: Record<string, string> = {};
    selectors = new Map<string, Element>();
    children: Element[] = [];
    style = { values: new Map<string, string>(), setProperty(name: string, value: string) { this.values.set(name, value); } };
    hidden = false;
    disabled = true;
    value = '';
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    hasAttribute(name: string) { return this.attributes.has(name); }
    querySelector(selector: string) { return this.selectors.get(selector) ?? null; }
    querySelectorAll() { return swatches; }
    contains(target: Element | null): boolean { return target === this || this.children.some(child => child.contains(target)); }
    focus() { document.activeElement = this; document.dispatchEvent(eventFor('focusin', this)); }
    click() { this.dispatchEvent(new Event('click')); }
    append(child: Element) { this.children.push(child); return child; }
  }
  function eventFor(type: string, target: Element) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    return event;
  }
  const root = new Element();
  const wrapper = root.append(new Element());
  root.selectors.set('[data-price-style]', wrapper);
  const controls = ['trigger', 'panel', 'colour', 'font', 'reset'].map(() => wrapper.append(new Element()));
  const [trigger, panel, colour, font, reset] = controls;
  for (const [index, selector] of ['[data-price-style-trigger]', '[data-price-style-panel]', '[data-price-colour]', '[data-price-font]', '[data-reset-price-style]'].entries()) {
    wrapper.selectors.set(selector, controls[index]);
  }
  const swatches = ['#ffffff', '#ff981e', '#90c7ff'].map(value => {
    const swatch = wrapper.append(new Element());
    swatch.dataset.priceSwatch = value;
    return swatch;
  });
  const document = Object.assign(new EventTarget(), { activeElement: null as Element | null });
  const storage = new Map<string, string>();
  if (saved !== undefined) storage.set('obt-video-price-style', saved);
  let writes = 0;
  let refreshes = 0;
  let toggles = 0;
  root.addEventListener('pricestyletoggle', () => { toggles++; });
  const window = {
    localStorage: {
      getItem(key: string) { if (blocked) throw Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key: string, value: string) { if (blocked) throw Error('Storage blocked'); storage.set(key, value); writes++; },
    },
  };
  const module: { createVideoPriceStyle?: typeof createVideoPriceStyle } = {};
  runInNewContext(script, { exports: module, window, document, Event });
  const style = module.createVideoPriceStyle!(root as unknown as HTMLElement, () => { refreshes++; });
  return {
    root, trigger, panel, colour, font, reset, swatches, document, style,
    writes: () => writes, refreshes: () => refreshes, toggles: () => toggles,
    saved: () => storage.get('obt-video-price-style'),
    changeColour(value: string) { colour.value = value; colour.dispatchEvent(new Event('input')); },
    changeFont(value: string) { font.value = value; font.dispatchEvent(new Event('change')); },
    outside() { document.dispatchEvent(eventFor('pointerdown', new Element())); },
    escape() {
      const event = Object.assign(eventFor('keydown', font), { key: 'Escape' });
      wrapper.dispatchEvent(event);
      return event.defaultPrevented;
    },
  };
}

test('style controls preview choices immediately, save them, and restore them on a fresh page', () => {
  const h = harness();
  assert.equal(h.trigger.disabled, false);
  assert.equal(h.panel.hidden, true);
  assert.equal(h.reset.disabled, true);
  assert.equal(h.colour.value, '#ffffff');
  assert.equal(h.font.value, 'modern');
  assert.equal(h.writes(), 0);
  h.swatches[1].click();
  assert.equal(h.root.style.values.get('--video-price-colour'), '#ff981e');
  assert.equal(h.swatches[1].attributes.get('aria-pressed'), 'true');
  assert.equal(h.swatches[0].attributes.get('aria-pressed'), 'false');
  h.changeColour('#Ab12CD');
  h.changeFont('serif');
  assert.equal(h.root.style.values.get('--video-price-colour'), '#ab12cd');
  assert.match(h.root.style.values.get('--video-price-font')!, /Georgia/);
  assert.ok(h.refreshes() > 1, 'font changes must re-fit the price within the viewport');
  assert.equal(h.reset.disabled, false);
  const restored = harness({ saved: h.saved() });
  assert.equal(restored.colour.value, '#ab12cd');
  assert.equal(restored.font.value, 'serif');
  assert.equal(restored.writes(), 0);
  assert.equal(restored.panel.hidden, true);
  restored.reset.click();
  assert.equal(restored.colour.value, '#ffffff');
  assert.equal(restored.font.value, 'modern');
  assert.equal(restored.reset.disabled, true);
  assert.equal(restored.document.activeElement, restored.font);
  assert.deepEqual(JSON.parse(restored.saved()!), { version: 1, colour: '#ffffff', font: 'modern' });
  h.style.destroy(); restored.style.destroy();
});

test('the style panel supports Escape, outside dismissal, native focus, and mutual exclusion with currency', () => {
  const h = harness();
  h.trigger.focus();
  h.trigger.click();
  assert.equal(h.panel.hidden, false);
  assert.equal(h.trigger.attributes.get('aria-expanded'), 'true');
  assert.equal(h.root.hasAttribute('data-price-style-open'), true);
  h.font.focus();
  assert.equal(h.panel.hidden, false);
  assert.equal(h.escape(), true);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.panel.hidden, true);
  assert.equal(h.escape(), false);
  h.trigger.click(); h.outside();
  assert.equal(h.panel.hidden, true);
  h.trigger.click();
  h.root.setAttribute('data-currency-open', '');
  h.root.dispatchEvent(new Event('currencytoggle'));
  assert.equal(h.panel.hidden, true);
  assert.equal(h.trigger.attributes.get('aria-expanded'), 'false');
  h.style.destroy();
});

test('malformed or unsafe saved styles fall back to defaults while valid fields restore independently', () => {
  for (const saved of ['invalid JSON', 'null', '[]', '{}', JSON.stringify({ version: 2, colour: '#123456', font: 'mono' }),
    JSON.stringify({ version: 1, colour: 'red; background:url(example)', font: 'constructor' })]) {
    const h = harness({ saved });
    assert.equal(h.colour.value, '#ffffff');
    assert.equal(h.font.value, 'modern');
    assert.equal(h.writes(), 0);
    h.style.destroy();
  }
  const h = harness({ saved: JSON.stringify({ version: 1, colour: '#FF981E', font: 'invalid' }) });
  assert.equal(h.colour.value, '#ff981e');
  assert.equal(h.font.value, 'modern');
  h.changeColour('invalid'); h.changeFont('__proto__');
  assert.equal(h.writes(), 0, 'malformed control values must not be persisted or applied');
  h.style.destroy();
});

test('storage failures preserve controls and destruction removes interactive behavior', () => {
  const h = harness({ blocked: true });
  h.changeColour('#123456'); h.changeFont('mono');
  assert.equal(h.root.style.values.get('--video-price-colour'), '#123456');
  assert.match(h.root.style.values.get('--video-price-font')!, /monospace/);
  assert.equal(h.writes(), 0);
  h.trigger.click();
  h.style.destroy(); h.style.destroy();
  assert.equal(h.panel.hidden, true);
  const refreshes = h.refreshes();
  const toggles = h.toggles();
  h.trigger.click(); h.swatches[0].click(); h.changeFont('serif'); h.reset.click();
  assert.equal(h.refreshes(), refreshes);
  assert.equal(h.toggles(), toggles);
});
