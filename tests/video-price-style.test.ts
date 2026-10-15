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
    checked = false;
    offsetWidth = 90;
    offsetHeight = 44;
    box = { left: 300, top: 200, width: 400, height: 100, bottom: 300 };
    getBoundingClientRect() { return { ...this.box, right: this.box.left + this.box.width }; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    toggleAttribute(name: string, value: boolean) { if (value) this.attributes.set(name, ""); else this.attributes.delete(name); }
    hasAttribute(name: string) { return this.attributes.has(name); }
    querySelector(selector: string) { return this.selectors.get(selector) ?? null; }
    querySelectorAll() { return swatches; }
    contains(target: Element | null): boolean { return target === this || this.children.some(child => child.contains(target)); }
    focus() { document.activeElement = this; document.dispatchEvent(eventFor('focusin', this)); }
    click() { this.dispatchEvent(Object.assign(new Event('click'), { detail: 1 })); }
    append(child: Element) { this.children.push(child); return child; }
  }
  function eventFor(type: string, target: Element) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    return event;
  }
  const root = new Element();
  const dock = root.append(new Element());
  const position = root.append(new Element());
  root.selectors.set('[data-price-position]', position);
  const wrapper = root.append(new Element());
  root.selectors.set('[data-price-style]', wrapper);
  const controls = ['trigger', 'panel', 'colour', 'font', 'reset', 'stroke', 'strokeWidth', 'strokeColour', 'strokeOptions', 'strokeValue'].map(() => wrapper.append(new Element()));
  const [trigger, panel, colour, font, reset, stroke, strokeWidth, strokeColour, strokeOptions, strokeValue] = controls;
  panel.offsetWidth = 260; panel.offsetHeight = 320;
  for (const [index, selector] of ['[data-price-style-trigger]', '[data-price-style-panel]', '[data-price-colour]', '[data-price-font]', '[data-reset-price-style]', '[data-price-stroke]', '[data-price-stroke-width]', '[data-price-stroke-colour]', '[data-stroke-options]', '[data-stroke-width-value]'].entries()) {
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
  const window = Object.assign(new EventTarget(), { innerWidth: 1000, innerHeight: 600,
    localStorage: {
      getItem(key: string) { if (blocked) throw Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key: string, value: string) { if (blocked) throw Error('Storage blocked'); storage.set(key, value); writes++; },
    },
  });
  const module: { createVideoPriceStyle?: typeof createVideoPriceStyle } = {};
  runInNewContext(script, { exports: module, window, document, Event });
  const style = module.createVideoPriceStyle!(root as unknown as HTMLElement, () => { refreshes++; });
  return {
    root, dock, wrapper, position, window, trigger, panel, colour, font, reset, stroke, strokeWidth, strokeColour, strokeOptions, strokeValue, swatches, document, style,
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
  assert.notEqual(restored.document.activeElement, restored.font);
  assert.deepEqual(JSON.parse(restored.saved()!), { version: 1, colour: '#ffffff', font: 'modern', stroke: false, strokeWidth: 1, strokeColour: '#000000' });
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

test('digital font and optional stroke settings persist with valid bounds and no stroke by default', () => {
  const h = harness();
  assert.equal(h.stroke.checked, false);
  assert.equal(h.strokeOptions.hidden, true);
  assert.equal(h.root.style.values.get('--video-price-stroke-width'), '0px');
  h.changeFont('digital');
  h.stroke.checked = true; h.stroke.dispatchEvent(new Event('change'));
  h.strokeWidth.value = '3.5'; h.strokeWidth.dispatchEvent(new Event('input'));
  h.strokeColour.value = '#AABBCC'; h.strokeColour.dispatchEvent(new Event('input'));
  const restored = harness({ saved: h.saved() });
  assert.equal(restored.font.value, 'digital');
  assert.match(restored.root.style.values.get('--video-price-font')!, /OBT Digital/);
  assert.equal(restored.stroke.checked, true);
  assert.equal(restored.strokeOptions.hidden, false);
  assert.equal(restored.strokeWidth.value, '3.5');
  assert.equal(restored.strokeColour.value, '#aabbcc');
  assert.equal(restored.root.style.values.get('--video-price-stroke-width'), '3.5px');
  assert.equal(restored.writes(), 0);
  restored.stroke.checked = false; restored.stroke.dispatchEvent(new Event('change'));
  assert.equal(restored.root.style.values.get('--video-price-stroke-width'), '0px');
  assert.equal(restored.strokeWidth.disabled, true);
  for (const value of ['-1', 'Infinity', '7']) {
    const invalid = harness({ saved: `{"version":1,"stroke":true,"strokeWidth":${value},"strokeColour":"invalid"}` });
    assert.equal(invalid.strokeWidth.value, '1');
    assert.equal(invalid.strokeColour.value, '#000000');
    invalid.style.destroy();
  }
  h.style.destroy(); restored.style.destroy();
});

test('reset style unticks Stroke, removes its appearance, and saves the disabled state for the next visit', () => {
  const h = harness({ saved: JSON.stringify({
    version: 1, colour: '#ff981e', font: 'digital', stroke: true, strokeWidth: 3.5, strokeColour: '#ffffff',
  }) });
  assert.equal(h.stroke.checked, true);
  h.reset.click();
  assert.equal(h.stroke.checked, false);
  assert.equal(h.strokeOptions.hidden, true);
  assert.equal(h.strokeWidth.disabled, true);
  assert.equal(h.strokeColour.disabled, true);
  assert.equal(h.root.style.values.get('--video-price-stroke-width'), '0px');
  assert.equal(JSON.parse(h.saved()!).stroke, false);
  const restored = harness({ saved: h.saved() });
  assert.equal(restored.stroke.checked, false);
  assert.equal(restored.strokeOptions.hidden, true);
  assert.equal(restored.root.style.values.get('--video-price-stroke-width'), '0px');
  h.style.destroy(); restored.style.destroy();
});

test('Reset style works with the panel closed and returns focus to Edit style', () => {
  const h = harness({ saved: JSON.stringify({ version: 1, font: 'digital', stroke: true }) });
  h.reset.focus();
  h.reset.dispatchEvent(Object.assign(new Event('click'), { detail: 0 }));
  assert.equal(h.reset.disabled, true);
  assert.equal(h.panel.hidden, true);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.stroke.checked, false);
  h.style.destroy();
});

test('Style follows the price and flips above it near the viewport bottom, keeping its panel on screen', () => {
  const h = harness();
  assert.equal(h.root.hasAttribute('data-price-style-above'), false);
  assert.equal(h.wrapper.style.values.get('top'), '310px');
  h.position.box = { left: 900, top: 450, width: 80, height: 120, bottom: 570 };
  h.root.dispatchEvent(new Event('pricelayoutchange'));
  assert.equal(h.root.hasAttribute('data-price-style-above'), true);
  assert.equal(h.wrapper.style.values.get('top'), '396px');
  h.trigger.click();
  assert.ok(Number.parseFloat(h.panel.style.values.get('left')!) + h.panel.offsetWidth <= h.window.innerWidth - 16);
  assert.ok(Number.parseFloat(h.panel.style.values.get('top')!) >= 16);
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.panel.hidden, true);
  h.style.destroy();
});

test('Style moves above the price when its usual position would cover playback or URL controls', () => {
  const h = harness();
  h.dock.box = { left: 250, top: 310, width: 500, height: 160, bottom: 470 };
  h.root.selectors.set('.video-dock', h.dock);
  h.root.dispatchEvent(new Event('pricelayoutchange'));
  assert.equal(h.root.hasAttribute('data-price-style-above'), true);
  assert.equal(h.wrapper.style.values.get('top'), '146px');
  h.position.box = { left: 40, top: 200, width: 100, height: 100, bottom: 300 };
  h.root.dispatchEvent(new Event('pricelayoutchange'));
  assert.equal(h.root.hasAttribute('data-price-style-above'), false, 'controls beside the price do not force the button above it');
  h.style.destroy();
});

test('the full price button row stays on screen and avoids playback controls after reset appears', () => {
  const h = harness();
  h.wrapper.offsetWidth = 330;
  h.wrapper.offsetHeight = 72;
  h.position.box = { left: 900, top: 450, width: 80, height: 120, bottom: 570 };
  h.root.dispatchEvent(new Event('pricelayoutchange'));
  assert.equal(h.wrapper.style.values.get('left'), '654px');
  assert.equal(h.wrapper.style.values.get('top'), '368px');
  h.position.box = { left: 300, top: 200, width: 400, height: 100, bottom: 300 };
  h.dock.box = { left: 600, top: 310, width: 300, height: 160, bottom: 470 };
  h.root.selectors.set('.video-dock', h.dock);
  h.root.dispatchEvent(new Event('pricelayoutchange'));
  assert.equal(h.root.hasAttribute('data-price-style-above'), true, 'reset beside Edit style must also avoid the dock');
  assert.equal(h.wrapper.style.values.get('top'), '118px');
  h.style.destroy();
});
