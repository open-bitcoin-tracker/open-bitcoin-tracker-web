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
    hovered = false;
    focusVisible = false;
    matches(selector: string) { return selector === ':hover' ? this.hovered : selector === ':focus-visible' && this.focusVisible; }
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
  const position = root.append(new Element());
  root.selectors.set('[data-price-position]', position);
  const wrapper = root.append(new Element());
  root.selectors.set('[data-price-style]', wrapper);
  const menu = wrapper.append(new Element());
  menu.offsetWidth = 260; menu.offsetHeight = 320;
  wrapper.selectors.set('[data-price-settings-panel]', menu);
  const controls = ['trigger', 'panel', 'colour', 'font', 'stroke', 'strokeWidth', 'strokeColour', 'strokeOptions', 'strokeValue'].map(() => wrapper.append(new Element()));
  const [trigger, panel, colour, font, stroke, strokeWidth, strokeColour, strokeOptions, strokeValue] = controls;
  panel.offsetWidth = 260; panel.offsetHeight = 320;
  for (const [index, selector] of ['[data-price-style-trigger]', '[data-price-style-panel]', '[data-price-colour]', '[data-price-font]', '[data-price-stroke]', '[data-price-stroke-width]', '[data-price-stroke-colour]', '[data-stroke-options]', '[data-stroke-width-value]'].entries()) {
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
    root, wrapper, position, window, trigger, panel, menu, colour, font, stroke, strokeWidth, strokeColour, strokeOptions, strokeValue, swatches, document, style,
    writes: () => writes, refreshes: () => refreshes, toggles: () => toggles,
    saved: () => storage.get('obt-video-price-style'),
    restore: () => root.dispatchEvent(new Event('pricerestore')),
    changeColour(value: string) { colour.value = value; colour.dispatchEvent(new Event('input')); },
    changeFont(value: string) { font.value = value; font.dispatchEvent(new Event('change')); },
    outside() { document.dispatchEvent(eventFor('pointerdown', new Element())); },
    documentClick(target = new Element()) {
      const event = eventFor('click', target);
      document.dispatchEvent(event);
      return event;
    },
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
  assert.equal(h.root.hasAttribute('data-price-style-custom'), false);
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
  assert.equal(h.root.hasAttribute('data-price-style-custom'), true);
  const restored = harness({ saved: h.saved() });
  assert.equal(restored.colour.value, '#ab12cd');
  assert.equal(restored.font.value, 'serif');
  assert.equal(restored.writes(), 0);
  assert.equal(restored.panel.hidden, true);
  restored.restore();
  assert.equal(restored.colour.value, '#ffffff');
  assert.equal(restored.font.value, 'modern');
  assert.equal(restored.root.hasAttribute('data-price-style-custom'), false);
  assert.notEqual(restored.document.activeElement, restored.font);
  assert.deepEqual(JSON.parse(restored.saved()!), { version: 1, colour: '#ffffff', font: 'modern', stroke: false, strokeWidth: 1, strokeColour: '#000000' });
  h.style.destroy(); restored.style.destroy();
});

test('additional price fonts persist, re-fit the price, and reset their font metrics', () => {
  for (const [font, family, weight, spacing] of [
    ['space', 'Space Grotesk', '700', '-.03em'],
    ['slab', 'Roboto Slab', '700', '-.03em'],
    ['bungee', 'Bungee', '400', '0'],
  ]) {
    const h = harness();
    h.changeFont('digital');
    const before = h.refreshes();
    h.changeFont(font);
    assert.ok(h.refreshes() > before, 'changing the font must re-fit the price');
    const restored = harness({ saved: h.saved() });
    assert.equal(restored.font.value, font);
    assert.equal(restored.root.style.values.get('--video-price-font')!.split(',')[0], `"${family}"`);
    assert.equal(restored.root.style.values.get('--video-price-weight'), weight);
    assert.equal(restored.root.style.values.get('--video-price-spacing'), spacing);
    assert.equal(restored.root.style.values.get('--video-price-padding'), '0');
    assert.equal(restored.writes(), 0);
    restored.restore();
    assert.equal(restored.font.value, 'modern');
    assert.equal(restored.root.style.values.get('--video-price-weight'), '750');
    assert.equal(restored.root.style.values.get('--video-price-spacing'), '-.065em');
    h.style.destroy(); restored.style.destroy();
  }
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
  h.trigger.click(); h.swatches[0].click(); h.changeFont('serif'); h.restore();
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
  h.restore();
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

test('Restore resets style with the panel closed and preserves focus', () => {
  const h = harness({ saved: JSON.stringify({ version: 1, font: 'digital', stroke: true }) });
  h.trigger.focus();
  h.restore();
  assert.equal(h.root.hasAttribute('data-price-style-custom'), false);
  assert.equal(h.panel.hidden, true);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.stroke.checked, false);
  h.style.destroy();
});

test('the editing menu uses free space beside, below, or above the price', () => {
  const h = harness();
  h.trigger.click();
  assert.equal(h.wrapper.style.values.get('left'), '710px');
  assert.equal(h.wrapper.style.values.get('top'), '200px');
  h.window.innerWidth = 1200;
  h.position.box = { left: 650, top: 80, width: 100, height: 100, bottom: 180 };
  h.root.dispatchEvent(new Event('pricelayoutchange'));
  assert.equal(h.wrapper.style.values.get('left'), '380px', 'a price on the right opens the panel on its left');
  h.window.innerWidth = 1000;
  h.position.box = { left: 100, top: 200, width: 700, height: 100, bottom: 300 };
  h.root.dispatchEvent(new Event('pricelayoutchange'));
  assert.equal(h.wrapper.style.values.get('left'), '320px', 'an oversized price centers the menu below the price');
  assert.equal(h.wrapper.style.values.get('top'), '16px', 'a tall menu moves above when there is no space below');
  h.position.box = { left: 900, top: 450, width: 80, height: 120, bottom: 570 };
  h.root.dispatchEvent(new Event('pricelayoutchange'));
  assert.equal(h.wrapper.style.values.get('left'), '630px');
  assert.equal(h.wrapper.style.values.get('top'), '264px', 'bottom placement clamps the panel vertically');
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.panel.hidden, true);
  h.style.destroy();
});

test('the editing menu remains reachable in narrow and short viewports after resize', () => {
  const h = harness();
  h.trigger.click();
  h.window.innerWidth = 390;
  h.window.innerHeight = 240;
  h.menu.offsetHeight = 208;
  h.position.box = { left: 40, top: 20, width: 310, height: 150, bottom: 170 };
  h.window.dispatchEvent(new Event('resize'));
  assert.equal(h.menu.style.values.get('max-height'), '208px');
  assert.equal(h.wrapper.style.values.get('top'), '16px');
  assert.ok(Number.parseFloat(h.wrapper.style.values.get('left')!) >= 16);
  assert.ok(Number.parseFloat(h.wrapper.style.values.get('left')!) + h.menu.offsetWidth <= 374);
  h.style.destroy();
});

test('style customization state includes manual return to defaults', () => {
  const h = harness();
  assert.equal(h.root.hasAttribute('data-price-style-custom'), false);
  h.swatches[1].click();
  assert.equal(h.root.hasAttribute('data-price-style-custom'), true);
  h.swatches[0].click();
  assert.equal(h.root.hasAttribute('data-price-style-custom'), false);
  h.changeFont('serif');
  assert.equal(h.root.hasAttribute('data-price-style-custom'), true);
  h.trigger.focus();
  h.restore();
  assert.equal(h.root.hasAttribute('data-price-style-custom'), false);
  assert.equal(h.document.activeElement, h.trigger);
  h.style.destroy();
});


test('outside pointer dismissal consumes exactly its following click before playback can handle it', () => {
  const h = harness();
  h.trigger.click();
  h.outside();
  h.position.focus();
  assert.equal(h.panel.hidden, true);
  const dismissal = h.documentClick();
  assert.equal(dismissal.defaultPrevented, true);
  assert.equal(dismissal.cancelBubble, true, 'dismissal must stop before reaching background playback handlers');
  assert.equal(h.documentClick().defaultPrevented, false, 'later ordinary clicks are not swallowed');
  h.trigger.click();
  const inside = h.documentClick(h.font);
  assert.equal(inside.defaultPrevented, false);
  assert.equal(h.panel.hidden, false, 'inside controls keep their normal click behavior');
  h.style.destroy();
});


test('the editing menu is anchored before opening either dropdown', () => {
  const h = harness();
  assert.equal(h.panel.hidden, true);
  assert.equal(h.menu.hidden, false);
  assert.equal(h.wrapper.style.values.get('left'), '710px');
  assert.equal(h.wrapper.style.values.get('top'), '200px');
  h.trigger.click();
  assert.equal(h.panel.hidden, false);
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.panel.hidden, true);
  assert.equal(h.menu.hidden, false, 'the price editing frame controls menu visibility');
  h.style.destroy();
});
