import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { createVideoPriceLayout } from '../src/lib/video-price-layout.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/video-price-layout.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const storageKey = 'obt-video-price-layout';
type Corner = 'nw' | 'ne' | 'sw' | 'se';
interface Rect { left: number; top: number; width: number; height: number }
interface Options { saved?: string; blockedStorage?: boolean; viewport?: Partial<Rect>; width?: number; height?: number; observer?: boolean; editingMenu?: boolean }
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .001, `${actual} should equal ${expected}`);

function harness(options: Options = {}) {
  class Style {
    values = new Map<string, string>();
    writes = 0;
    position = { left: '', top: '' };
    getPropertyValue(name: string) { return this.values.get(name) ?? ''; }
    setProperty(name: string, value: string) { this.writes++; this.values.set(name, value); }
    removeProperty(name: string) { this.writes++; this.values.delete(name); }
    get left() { return this.position.left; }
    set left(value: string) { this.writes++; this.position.left = value; }
    get top() { return this.position.top; }
    set top(value: string) { this.writes++; this.position.top = value; }
  }
  class Element extends EventTarget {
    attributes = new Map<string, string>();
    dataset: Record<string, string> = {};
    selectors = new Map<string, Element>();
    children: Element[] = [];
    parent: Element | null = null;
    style = new Style();
    tabIndex = -1;
    disabled = true;
    textContent = '';
    title = '';
    hidden = false;
    captures = new Set<number>();
    captureFails = false;
    focusVisible = false;
    listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    rect: () => Rect = () => ({ left: 0, top: 0, width: 0, height: 0 });
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
    toggleAttribute(name: string, force: boolean) { if (force) this.attributes.set(name, ''); else this.attributes.delete(name); }
    querySelector(selector: string) { return this.selectors.get(selector) ?? null; }
    querySelectorAll(selector: string) { assert.equal(selector, '[data-price-resize]'); return this.children; }
    contains(target: Element | null): boolean { return target === this || this.children.some(child => child.contains(target)); }
    closest(selector: string): Element | null { if (selector === '[data-price-style]') return this.dataset.priceStyle !== undefined ? this : this.parent?.closest(selector) ?? null; assert.equal(selector, '[data-price-resize]'); return this.dataset.priceResize ? this : this.parent?.closest(selector) ?? null; }
    matches(selector: string) { assert.equal(selector, ':focus-visible'); return this.focusVisible; }
    getBoundingClientRect() { return this.rect(); }
    focus() {
      const previous = document.activeElement;
      if (previous && previous !== this && position.contains(previous)) position.dispatchEvent(Object.assign(targetEvent('focusout', previous), { relatedTarget: this }));
      document.activeElement = this;
      if (position.contains(this)) position.dispatchEvent(targetEvent('focusin', this));
    }
    click() { return position.contains(this) ? !position.dispatchEvent(targetEvent('click', this)) : !this.dispatchEvent(new Event('click')); }
    append(child: Element) { child.parent = this; this.children.push(child); return child; }
    setPointerCapture(id: number) { if (this.captureFails) throw Error('Capture unavailable'); this.captures.add(id); }
    hasPointerCapture(id: number) { return this.captures.has(id); }
    releasePointerCapture(id: number) { this.captures.delete(id); this.dispatchEvent(Object.assign(new Event('lostpointercapture'), { pointerId: id })); }
  }
  function targetEvent(type: string, target: Element) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    return event;
  }
  const root = new Element();
  const stage = root.append(new Element());
  const position = stage.append(new Element());
  const style = stage.append(new Element());
  style.dataset.priceStyle = '';
  const menu = style.append(new Element());
  menu.rect = () => ({ left: 200, top: 450, width: 260, height: 120 });
  if (options.editingMenu) root.selectors.set('[data-price-settings-panel]', menu);
  const reset = style.append(new Element());
  reset.hidden = true;
  reset.textContent = reset.title = 'Restore';
  position.tabIndex = 0;
  const handles = Object.fromEntries((['nw', 'ne', 'sw', 'se'] as const).map(corner => {
    const handle = position.append(new Element());
    handle.dataset.priceResize = corner;
    return [corner, handle];
  })) as Record<Corner, Element>;
  const document = Object.assign(new Element(), { hidden: false, activeElement: null as Element | null });
  const outside = new Element();
  const viewport: Rect = { left: 100, top: 80, width: 1000, height: 600, ...options.viewport };
  let naturalWidth = options.width ?? 200;
  let naturalHeight = options.height ?? 100;
  stage.rect = () => ({ ...viewport });
  style.rect = () => ({ left: viewport.left + 260, top: viewport.top + 180, width: 480, height: 52 });
  position.rect = () => {
    const scale = Number(root.style.getPropertyValue('--video-price-scale') || 1);
    const fit = Number(root.style.getPropertyValue('--video-price-fit') || 1);
    return { left: viewport.left + (Number.parseFloat(position.style.left) || 0), top: viewport.top + (Number.parseFloat(position.style.top) || 0), width: naturalWidth * scale * fit, height: naturalHeight * scale * fit };
  };
  root.selectors.set('[data-price-stage]', stage);
  root.selectors.set('[data-price-position]', position);
  root.selectors.set('[data-price-style]', style);
  root.selectors.set('[data-reset-price]', reset);
  const saved: { version: number; x: number; y: number; size: number }[] = [];
  let now = 0;
  let nextTimer = 0;
  const timers = new Map<number, { due: number; run(): void }>();
  const window = Object.assign(new Element(), {
    localStorage: {
      getItem(key: string) { assert.equal(key, storageKey); if (options.blockedStorage) throw Error('Blocked'); return options.saved ?? null; },
      setItem(key: string, value: string) { assert.equal(key, storageKey); if (options.blockedStorage) throw Error('Blocked'); saved.push(JSON.parse(value)); },
    },
    setTimeout(run: () => void, delay: number) { const id = ++nextTimer; timers.set(id, { due: now + delay, run }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
  });
  let notifications = 0;
  let observerCallback: (() => void) | undefined;
  let disconnects = 0;
  const observed: unknown[] = [];
  class Observer {
    constructor(callback: () => void) { observerCallback = callback; }
    observe(element: unknown) { observed.push(element); }
    disconnect() { disconnects++; }
  }
  root.addEventListener('pricelayoutchange', () => { notifications++; });
  const module: { createVideoPriceLayout?: typeof createVideoPriceLayout } = {};
  runInNewContext(script, { exports: module, window, document, Event, ResizeObserver: options.observer === false ? undefined : Observer });
  const layout = module.createVideoPriceLayout!(root as unknown as HTMLElement);
  return {
    root, stage, position, style, menu, reset, handles, document, window, outside, saved, layout, viewport, observed, timers,
    notifications: () => notifications,
    disconnects: () => disconnects,
    left: () => Number.parseFloat(position.style.left), top: () => Number.parseFloat(position.style.top),
    scale: () => Number(root.style.getPropertyValue('--video-price-scale')),
    frame: () => root.attributes.has('data-price-layout-open'),
    focus(target: Element, visible = true) { target.focusVisible = visible; target.focus(); },
    pointer(type: string, target: Element, coordinates: Partial<PointerEvent> = {}) {
      const event = Object.assign(targetEvent(type, target), { pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0, ...coordinates });
      const surface = position.contains(target) ? position : target;
      surface.dispatchEvent(event);
      if (surface !== window && type === 'pointermove') window.dispatchEvent(event);
      return event.defaultPrevented;
    },
    key(target: Element, key: string, modifiers: Partial<KeyboardEvent> = {}) {
      const event = Object.assign(targetEvent('keydown', target), { key, ...modifiers });
      position.dispatchEvent(event);
      window.dispatchEvent(event);
      return event.defaultPrevented;
    },
    advance(milliseconds: number) {
      const end = now + milliseconds;
      while (true) {
        const entry = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!entry) break;
        timers.delete(entry[0]); now = entry[1].due; entry[1].run();
      }
      now = end;
    },
    resize(changes: Partial<Rect>) { Object.assign(viewport, changes); window.dispatchEvent(new Event('resize')); },
    resizePrice(width: number, height: number) { naturalWidth = width; naturalHeight = height; observerCallback?.(); },
    notifyObserver() { observerCallback?.(); },
    visibility(hidden: boolean) { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('price layout stays centered and restores validated bounded preferences independently of playback', () => {
  const h = harness();
  assert.equal(h.root.attributes.has('data-price-layout-ready'), true);
  assert.equal(h.left(), 400);
  assert.equal(h.top(), 250);
  assert.equal(h.scale(), 1);
  assert.equal(h.position.tabIndex, 0);
  assert.equal(h.reset.disabled, true);
  assert.equal(h.root.attributes.has('data-price-default'), true);
  assert.equal(Object.values(h.handles).every(handle => handle.tabIndex === -1), true);
  assert.equal(h.frame(), false);
  h.layout.destroy();
  const restored = harness({ saved: JSON.stringify({ version: 1, x: -20, y: 130, size: 300 }) });
  assert.equal(restored.left(), 0);
  assert.equal(restored.top(), 300);
  assert.equal(restored.scale(), 3);
  assert.equal(restored.root.attributes.has('data-price-default'), false);
  assert.equal(restored.reset.disabled, false);
  restored.layout.destroy();
  for (const saved of ['broken JSON', '{}', 'null', '{"version":2,"x":0,"y":0,"size":25}', '{"version":1,"x":"0","y":0,"size":25}', '{"version":1,"x":1e400,"y":0,"size":25}']) {
    const invalid = harness({ saved });
    assert.equal(invalid.left(), 400, saved);
    assert.equal(invalid.scale(), 1, saved);
    invalid.layout.destroy();
  }
  const blocked = harness({ blockedStorage: true, observer: false });
  blocked.key(blocked.position, 'ArrowRight');
  close(blocked.left(), 416);
  blocked.layout.destroy();
});

test('the frame follows price hover rather than general page UI visibility', () => {
  const h = harness();
  assert.equal(h.frame(), false);
  h.root.dispatchEvent(new Event('videouireveal'));
  h.pointer('pointermove', h.outside);
  assert.equal(h.frame(), false, 'revealing page controls away from the price keeps its frame hidden');
  h.pointer('pointerenter', h.position, { pointerType: 'mouse' });
  assert.equal(h.frame(), true);
  assert.equal(Object.values(h.handles).every(handle => handle.tabIndex === 0), true);
  h.advance(10000);
  assert.equal(h.frame(), true, 'hover needs no independent timeout');
  h.pointer('pointerleave', h.position);
  assert.equal(h.frame(), false);
  assert.equal(Object.values(h.handles).every(handle => handle.tabIndex === -1), true);
  h.root.dispatchEvent(new Event('videouireveal'));
  assert.equal(h.frame(), false);
  assert.equal(h.notifications(), 0, 'hover must not restart the page idle timer');
  h.layout.destroy();
});

test('UI dismissal hides the frame until the next price hover or keyboard interaction', () => {
  const h = harness();
  h.focus(h.position);
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.frame(), false);
  h.window.dispatchEvent(new Event('focus'));
  assert.equal(h.frame(), false);
  h.pointer('pointermove', h.position, { pointerType: 'mouse' });
  assert.equal(h.frame(), true);
  h.pointer('pointerleave', h.position);
  h.root.setAttribute('data-price-style-open', '');
  h.root.dispatchEvent(new Event('pricestyletoggle'));
  assert.equal(h.frame(), true, 'an open style panel keeps the frame and editing buttons visible');
  h.layout.destroy();
});

test('keyboard focus reveals handles and leaving the price hides them', () => {
  const h = harness();
  h.focus(h.position);
  assert.equal(h.frame(), true);
  h.focus(h.handles.ne);
  assert.equal(h.frame(), true);
  h.focus(h.outside, false);
  assert.equal(h.frame(), false);
  h.focus(h.position);
  assert.equal(h.frame(), true);
  h.pointer('pointermove', h.outside, { pointerType: 'mouse' });
  assert.equal(h.frame(), false, 'switching back to a mouse away from the price clears keyboard editing');
  h.layout.destroy();
});

test('touch reveals editing controls on the price without requiring hover', () => {
  const h = harness();
  h.pointer('pointerenter', h.position, { pointerType: 'touch' });
  assert.equal(h.frame(), false);
  const box = h.position.getBoundingClientRect();
  const point = { pointerType: 'touch', clientX: box.left + 20, clientY: box.top + 20 };
  h.pointer('pointerdown', h.position, point);
  h.pointer('pointerup', h.window, point);
  h.pointer('pointerleave', h.position, { pointerType: 'touch' });
  assert.equal(h.frame(), true);
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.frame(), false);
  h.layout.destroy();
});

test('dragging keeps the frame until release even after the pointer leaves the price', () => {
  const h = harness();
  const box = h.position.getBoundingClientRect();
  h.pointer('pointerdown', h.position, { clientX: box.left + 20, clientY: box.top + 20 });
  h.pointer('pointerleave', h.position);
  assert.equal(h.frame(), true);
  h.pointer('pointerup', h.window, { clientX: -100, clientY: -100 });
  assert.equal(h.frame(), false);
  h.position.click();
  assert.equal(h.frame(), false, 'the click after a captured drag must not reopen its frame');
  h.layout.destroy();
});

test('Escape hides focused handles without reopening and safely ends an active resize', () => {
  const h = harness();
  assert.equal(h.key(h.outside, 'Escape'), false, 'navigation outside the page root keeps its own Escape behavior');
  assert.equal(h.frame(), false);
  let dismissals = 0;
  h.root.addEventListener('priceeditortoggle', () => { if (!h.frame()) dismissals++; });
  h.focus(h.position);
  h.focus(h.handles.ne);
  assert.equal(h.key(h.handles.ne, 'Escape'), true);
  assert.equal(h.frame(), false);
  assert.equal(dismissals, 1, 'Escape notifies playback controls that editing has ended');
  assert.equal(h.document.activeElement, h.position);
  assert.equal(h.handles.ne.tabIndex, -1);
  h.window.dispatchEvent(new Event('focus'));
  h.advance(10000);
  assert.equal(h.frame(), false, 'focus events following Escape must not immediately restore handles');
  assert.equal(h.key(h.position, 'Escape'), false, 'a hidden frame does not consume another Escape');
  h.key(h.position, 'ArrowRight');
  assert.equal(h.frame(), true, 'the next meaningful keyboard interaction restores handles');
  const box = h.position.getBoundingClientRect();
  h.pointer('pointerdown', h.handles.se, { clientX: box.left + box.width, clientY: box.top + box.height });
  assert.equal(h.root.attributes.has('data-price-resizing'), true);
  h.key(h.position, 'Escape');
  assert.equal(h.root.attributes.has('data-price-dragging'), false);
  assert.equal(h.root.attributes.has('data-price-resizing'), false);
  assert.equal(h.position.captures.size, 0);
  assert.equal(h.frame(), false);
  assert.equal(h.timers.size, 0);
  h.pointer('pointerenter', h.position);
  assert.equal(h.frame(), true);
  h.layout.destroy();
});

test('ending pointer interaction keeps the frame visible until the page UI is dismissed', () => {
  const h = harness();
  h.focus(h.position);
  const box = h.position.getBoundingClientRect();
  h.pointer('pointerdown', h.position, { clientX: box.left + 20, clientY: box.top + 20 });
  h.pointer('pointerup', h.window, { clientX: box.left + 20, clientY: box.top + 20 });
  h.advance(1500);
  assert.equal(h.frame(), true);
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.frame(), false);
  h.layout.destroy();
});

test('price clicks allow playback, but trailing clicks after dragging or resizing are cancelled', () => {
  for (const pointerType of ['mouse', 'touch']) {
    const h = harness();
    let box = h.position.getBoundingClientRect();
    const start = { clientX: box.left + 20, clientY: box.top + 20, pointerType };
    h.pointer('pointerdown', h.position, start);
    h.pointer('pointerup', h.window, { ...start, clientX: start.clientX + 1 });
    assert.equal(h.position.click(), false, 'a click or tap tolerates slight pointer movement');

    h.pointer('pointerdown', h.position, start);
    h.pointer('pointermove', h.window, { ...start, clientX: start.clientX + 50 });
    h.pointer('pointerup', h.window, start);
    assert.equal(h.position.click(), true, 'a drag returning to its start must not toggle playback');

    h.pointer('pointerdown', h.position, start);
    h.pointer('pointerup', h.window, start);
    assert.equal(h.position.click(), false, 'the next ordinary click can toggle playback');

    box = h.position.getBoundingClientRect();
    const corner = { clientX: box.left + box.width, clientY: box.top + box.height, pointerType };
    h.pointer('pointerdown', h.handles.se, corner);
    h.pointer('pointerup', h.window, corner);
    assert.equal(h.position.click(), true, 'captured clicks from resize handles must not toggle playback');
    h.layout.destroy();
  }
});

test('dragging preserves the grab offset, clamps edges, and keeps its frame with the page UI', () => {
  const h = harness();
  const start = h.position.getBoundingClientRect();
  assert.equal(h.pointer('pointerdown', h.position, { button: 2 }), false);
  assert.equal(h.pointer('pointerdown', h.position, { isPrimary: false }), false);
  assert.equal(h.pointer('pointerdown', h.position, { clientX: start.left + 30, clientY: start.top + 20 }), true);
  assert.equal(h.position.hasPointerCapture(1), true);
  assert.equal(h.root.attributes.has('data-price-dragging'), true);
  h.advance(10000);
  assert.equal(h.frame(), true);
  h.pointer('pointermove', h.window, { pointerId: 2, clientX: 900, clientY: 600 });
  assert.equal(h.left(), 400);
  h.pointer('pointermove', h.window, { clientX: start.left + 130, clientY: start.top + 70 });
  assert.equal(h.left(), 500);
  assert.equal(h.top(), 300);
  assert.equal(h.saved.length, 0);
  h.pointer('pointerup', h.window, { clientX: 10000, clientY: -10000 });
  assert.equal(h.left(), 800);
  assert.equal(h.top(), 0);
  assert.equal(h.root.attributes.has('data-price-dragging'), false);
  assert.equal(h.position.hasPointerCapture(1), false);
  assert.deepEqual(h.saved.at(-1), { version: 1, x: 100, y: 0, size: 100 });
  assert.equal(h.saved.length, 1);
  assert.equal(h.notifications(), 2);
  h.advance(1500);
  assert.equal(h.frame(), false, 'releasing outside the price hides the frame');
  h.layout.destroy();
});

test('dragging snaps the price center to either screen axis and saves the centered placement', () => {
  const h = harness();
  const box = h.position.getBoundingClientRect();
  const x = box.left + 30, y = box.top + 20;
  const guides = () => [h.root.hasAttribute('data-price-snap-x'), h.root.hasAttribute('data-price-snap-y')];
  h.pointer('pointerdown', h.position, { clientX: x, clientY: y });
  assert.deepEqual(guides(), [false, false]);
  h.pointer('pointermove', h.window, { clientX: x + 6, clientY: y + 70 });
  close(h.left(), 400); close(h.top(), 320);
  assert.deepEqual(guides(), [true, false]);
  h.pointer('pointermove', h.window, { clientX: x + 70, clientY: y - 7 });
  close(h.left(), 470); close(h.top(), 250);
  assert.deepEqual(guides(), [false, true]);
  h.pointer('pointermove', h.window, { clientX: x - 5, clientY: y + 6 });
  close(h.left(), 400); close(h.top(), 250);
  assert.deepEqual(guides(), [true, true]);
  h.pointer('pointerup', h.window, { clientX: x - 5, clientY: y + 6 });
  assert.deepEqual(guides(), [false, false]);
  assert.deepEqual(h.saved.at(-1), { version: 1, x: 50, y: 50, size: 100 });
  assert.equal(h.frame(), true);
  h.layout.destroy();
});

test('each center snap resists small pointer jitter and releases when dragged farther away', () => {
  for (const axis of ['x', 'y'] as const) {
    const h = harness();
    const box = h.position.getBoundingClientRect();
    const x = box.left + 30, y = box.top + 20;
    h.pointer('pointerdown', h.position, { clientX: x, clientY: y });
    for (const [offset, snapped] of [[9, false], [7, true], [12, true], [17, false], [12, false], [-7, true]] as const) {
      h.pointer('pointermove', h.window, {
        clientX: x + (axis === 'x' ? offset : 80), clientY: y + (axis === 'y' ? offset : 80),
      });
      assert.equal(h.root.hasAttribute(`data-price-snap-${axis}`), snapped);
      close(axis === 'x' ? h.left() : h.top(), (axis === 'x' ? 400 : 250) + (snapped ? 0 : offset));
    }
    h.layout.destroy();
  }
});

test('snapping uses current price dimensions and viewport geometry after resizing', () => {
  const h = harness({ width: 300, height: 120, saved: JSON.stringify({ version: 1, x: 20, y: 80, size: 150 }) });
  h.resize({ width: 900, height: 700, left: 40, top: 25 });
  const box = h.position.getBoundingClientRect();
  h.pointer('pointerdown', h.position, { clientX: box.left + 40, clientY: box.top + 30, pointerType: 'touch' });
  const target = { clientX: 40 + (900 - box.width) / 2 + 40 + 5, clientY: 25 + (700 - box.height) / 2 + 30 - 5, pointerType: 'touch' };
  h.pointer('pointerup', h.window, target);
  close(h.left() + box.width / 2, 450);
  close(h.top() + box.height / 2, 350);
  assert.deepEqual(h.saved.at(-1), { version: 1, x: 50, y: 50, size: 150 });
  h.key(h.position, 'ArrowRight');
  assert.ok(h.left() > (900 - box.width) / 2, 'keyboard movement remains precise near a centerline');
  assert.equal(h.root.hasAttribute('data-price-snap-x'), false);
  h.layout.destroy();
});

test('snap guides clear on cancellation, capture loss, dismissal, reset, hidden pages, and cleanup', () => {
  for (const ending of ['cancel', 'capture', 'dismiss', 'reset', 'hidden', 'blur', 'escape', 'destroy']) {
    const h = harness();
    const box = h.position.getBoundingClientRect();
    h.pointer('pointerdown', h.position, { clientX: box.left + 30, clientY: box.top + 20 });
    h.pointer('pointermove', h.window, { clientX: box.left + 35, clientY: box.top + 25 });
    assert.equal(h.root.hasAttribute('data-price-snap-x'), true);
    assert.equal(h.root.hasAttribute('data-price-snap-y'), true);
    if (ending === 'cancel') h.pointer('pointercancel', h.window);
    if (ending === 'capture') h.position.releasePointerCapture(1);
    if (ending === 'dismiss') h.root.dispatchEvent(new Event('videouidismiss'));
    if (ending === 'reset') h.reset.click();
    if (ending === 'hidden') h.visibility(true);
    if (ending === 'blur') h.window.dispatchEvent(new Event('blur'));
    if (ending === 'escape') h.key(h.position, 'Escape');
    if (ending === 'destroy') h.layout.destroy();
    assert.equal(h.root.hasAttribute('data-price-snap-x'), false, ending);
    assert.equal(h.root.hasAttribute('data-price-snap-y'), false, ending);
    assert.equal(h.root.hasAttribute('data-price-dragging'), false, ending);
    h.layout.destroy();
  }
});

test('clicking a fitted price preserves normalized placement when no pointer movement occurs', () => {
  const initial = { version: 1, x: 15, y: 85, size: 200 };
  const h = harness({ viewport: { width: 320, height: 240 }, width: 600, saved: JSON.stringify(initial) });
  const box = h.position.getBoundingClientRect();
  h.pointer('pointerdown', h.position, { clientX: box.left + 20, clientY: box.top + 10 });
  h.pointer('pointerup', h.window, { clientX: box.left + 20, clientY: box.top + 10 });
  assert.deepEqual(h.saved.at(-1), initial);
  h.layout.destroy();
});

test('resizing out and returning to the starting corner restores the original size and anchor', () => {
  const h = harness();
  const box = h.position.getBoundingClientRect();
  const x = box.left + box.width, y = box.top + box.height;
  h.pointer('pointerdown', h.handles.se, { clientX: x, clientY: y });
  h.pointer('pointermove', h.window, { clientX: x + 100, clientY: y + 50 });
  close(h.scale(), 1.5);
  assert.equal(h.root.attributes.has('data-price-default'), false);
  assert.equal(h.reset.disabled, false);
  h.pointer('pointermove', h.window, { clientX: x, clientY: y });
  close(h.scale(), 1);
  close(h.left(), 400);
  close(h.top(), 250);
  assert.equal(h.root.attributes.has('data-price-default'), true);
  assert.equal(h.reset.disabled, true);
  h.pointer('pointerup', h.window, { clientX: x, clientY: y });
  close(h.saved.at(-1)!.size, 100);
  h.layout.destroy();
});

test('all four resize handles preserve their opposite corner and scale proportionally', () => {
  for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
    const h = harness();
    const box = h.position.getBoundingClientRect();
    const west = corner.endsWith('w'), north = corner.startsWith('n');
    const x = box.left + (west ? 0 : box.width), y = box.top + (north ? 0 : box.height);
    const anchorX = box.left + (west ? box.width : 0), anchorY = box.top + (north ? box.height : 0);
    h.pointer('pointerdown', h.handles[corner], { clientX: x, clientY: y });
    assert.equal(h.root.attributes.get('data-price-resizing'), corner);
    h.pointer('pointermove', h.window, { clientX: x + (west ? -100 : 100), clientY: y + (north ? -50 : 50) });
    const resized = h.position.getBoundingClientRect();
    close(resized.width, 300);
    close(resized.height, 150);
    close(resized.left + (west ? resized.width : 0), anchorX);
    close(resized.top + (north ? resized.height : 0), anchorY);
    assert.equal(h.saved.length, 0);
    h.pointer('pointerup', h.window, { clientX: x + (west ? -100 : 100), clientY: y + (north ? -50 : 50) });
    close(h.saved.at(-1)!.size, 150);
    assert.equal(h.root.attributes.has('data-price-resizing'), false);
    h.layout.destroy();
  }
});

test('Shift resizes every corner symmetrically around an off-center price and saves its placement', () => {
  for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
    const h = harness({ saved: JSON.stringify({ version: 1, x: 20, y: 75, size: 100 }) });
    const box = h.position.getBoundingClientRect();
    const west = corner.endsWith('w'), north = corner.startsWith('n');
    const x = box.left + (west ? 0 : box.width), y = box.top + (north ? 0 : box.height);
    const target = { clientX: x + (west ? -40 : 40), clientY: y + (north ? -20 : 20), shiftKey: true };
    h.pointer('pointerdown', h.handles[corner], { clientX: x, clientY: y, shiftKey: true });
    h.pointer('pointermove', h.window, target);
    const resized = h.position.getBoundingClientRect();
    close(resized.width, 280);
    close(resized.height, 140);
    close(resized.left + resized.width / 2, box.left + box.width / 2);
    close(resized.top + resized.height / 2, box.top + box.height / 2);
    h.pointer('pointerup', h.window, target);
    close(h.saved.at(-1)!.size, 140);
    const restored = harness({ saved: JSON.stringify(h.saved.at(-1)) });
    close(restored.left(), h.left());
    close(restored.top(), h.top());
    h.layout.destroy(); restored.layout.destroy();
  }
});

test('centered resizing stops at the nearest viewport edge without moving the price center', () => {
  const h = harness({ saved: JSON.stringify({ version: 1, x: 5, y: 85, size: 100 }) });
  const box = h.position.getBoundingClientRect();
  h.pointer('pointerdown', h.handles.se, { clientX: box.left + box.width, clientY: box.top + box.height, shiftKey: true });
  h.pointer('pointermove', h.window, { clientX: 10000, clientY: 10000, shiftKey: true });
  let resized = h.position.getBoundingClientRect();
  close(resized.left - h.viewport.left, 0);
  close(resized.left + resized.width / 2, box.left + box.width / 2);
  close(resized.top + resized.height / 2, box.top + box.height / 2);
  assert.ok(resized.top >= h.viewport.top);
  assert.ok(resized.top + resized.height <= h.viewport.top + h.viewport.height);
  h.pointer('pointerup', h.window, { clientX: -10000, clientY: -10000, shiftKey: true });
  resized = h.position.getBoundingClientRect();
  close(h.scale(), .25);
  close(resized.left + resized.width / 2, box.left + box.width / 2);
  close(resized.top + resized.height / 2, box.top + box.height / 2);
  h.layout.destroy();
});

test('pressing or releasing Shift during a resize switches anchors without a jump', () => {
  const h = harness();
  let box = h.position.getBoundingClientRect();
  let x = box.left + box.width, y = box.top + box.height;
  h.pointer('pointerdown', h.handles.se, { clientX: x, clientY: y });
  x += 40; y += 20;
  h.pointer('pointermove', h.window, { clientX: x, clientY: y });
  box = h.position.getBoundingClientRect();
  close(box.width, 240);
  h.pointer('pointermove', h.window, { clientX: x, clientY: y, shiftKey: true });
  assert.deepEqual(h.position.getBoundingClientRect(), box);
  x += 24; y += 12;
  h.pointer('pointermove', h.window, { clientX: x, clientY: y, shiftKey: true });
  let resized = h.position.getBoundingClientRect();
  close(resized.width, 288);
  close(resized.left + resized.width / 2, box.left + box.width / 2);
  close(resized.top + resized.height / 2, box.top + box.height / 2);
  box = resized;
  h.pointer('pointermove', h.window, { clientX: x, clientY: y, shiftKey: false });
  assert.deepEqual(h.position.getBoundingClientRect(), box);
  x += 28.8; y += 14.4;
  h.pointer('pointerup', h.window, { clientX: x, clientY: y });
  resized = h.position.getBoundingClientRect();
  close(resized.width, 316.8);
  close(resized.left, box.left);
  close(resized.top, box.top);
  h.layout.destroy();
});

test('Shift can be pressed with pointer movement and does not discard that movement', () => {
  const h = harness();
  const box = h.position.getBoundingClientRect();
  const x = box.left + box.width, y = box.top + box.height;
  h.pointer('pointerdown', h.handles.se, { clientX: x, clientY: y });
  h.pointer('pointerup', h.window, { clientX: x + 40, clientY: y + 20, shiftKey: true });
  const resized = h.position.getBoundingClientRect();
  close(resized.width, 280);
  close(resized.left + resized.width / 2, box.left + box.width / 2);
  close(resized.top + resized.height / 2, box.top + box.height / 2);
  h.layout.destroy();
});

test('resize projection ignores perpendicular movement and respects size and viewport limits', () => {
  const h = harness();
  let box = h.position.getBoundingClientRect();
  const x = box.left + box.width, y = box.top + box.height;
  h.pointer('pointerdown', h.handles.se, { clientX: x, clientY: y });
  h.pointer('pointermove', h.window, { clientX: x - 50, clientY: y + 100 });
  close(h.scale(), 1);
  h.pointer('pointermove', h.window, { clientX: x + 10000, clientY: y + 10000 });
  close(h.scale(), 3);
  h.pointer('pointerup', h.window, { clientX: x - 10000, clientY: y - 10000 });
  close(h.scale(), .25);
  h.layout.destroy();

  const edge = harness({ saved: JSON.stringify({ version: 1, x: 100, y: 100, size: 100 }) });
  box = edge.position.getBoundingClientRect();
  edge.pointer('pointerdown', edge.handles.se, { clientX: box.left + box.width, clientY: box.top + box.height });
  edge.pointer('pointerup', edge.window, { clientX: 10000, clientY: 10000 });
  close(edge.scale(), 1);
  close(edge.left(), 800);
  close(edge.top(), 500);
  edge.layout.destroy();
});

test('resizing a fitted price responds immediately to inward movement without a jump', () => {
  const h = harness({ viewport: { width: 320, height: 240 }, width: 600, saved: JSON.stringify({ version: 1, x: 0, y: 50, size: 200 }) });
  const box = h.position.getBoundingClientRect();
  close(box.width, 320);
  const x = box.left + box.width, y = box.top + box.height;
  h.pointer('pointerdown', h.handles.se, { clientX: x, clientY: y });
  h.pointer('pointermove', h.window, { clientX: x - box.width * .2, clientY: y - box.height * .2 });
  const smaller = h.position.getBoundingClientRect();
  close(smaller.width, box.width * .8);
  close(smaller.height, box.height * .8);
  close(smaller.left, box.left);
  close(smaller.top, box.top);
  h.pointer('pointerup', h.window, { clientX: x - box.width * .2, clientY: y - box.height * .2 });
  close(h.saved.at(-1)!.size, 128 / 3);
  h.layout.destroy();
});

test('Shift shrinks fitted prices immediately around their visible center', () => {
  const h = harness({ viewport: { width: 320, height: 240 }, width: 600, saved: JSON.stringify({ version: 1, x: 0, y: 65, size: 200 }) });
  const box = h.position.getBoundingClientRect();
  const x = box.left + box.width, y = box.top + box.height;
  h.pointer('pointerdown', h.handles.se, { clientX: x, clientY: y, shiftKey: true });
  h.pointer('pointerup', h.window, { clientX: x - box.width * .1, clientY: y - box.height * .1, shiftKey: true });
  const resized = h.position.getBoundingClientRect();
  close(resized.width, box.width * .8);
  close(resized.height, box.height * .8);
  close(resized.left + resized.width / 2, box.left + box.width / 2);
  close(resized.top + resized.height / 2, box.top + box.height / 2);
  close(h.saved.at(-1)!.size, 128 / 3);
  h.layout.destroy();
});

test('Shift with keyboard corner resizing holds the current center fixed', () => {
  const h = harness({ saved: JSON.stringify({ version: 1, x: 20, y: 75, size: 100 }) });
  const box = h.position.getBoundingClientRect();
  h.key(h.handles.nw, 'ArrowUp', { shiftKey: true });
  let resized = h.position.getBoundingClientRect();
  close(h.scale(), 1.05);
  close(resized.left + resized.width / 2, box.left + box.width / 2);
  close(resized.top + resized.height / 2, box.top + box.height / 2);
  h.key(h.handles.nw, 'ArrowDown', { shiftKey: true });
  resized = h.position.getBoundingClientRect();
  close(resized.left, box.left);
  close(resized.top, box.top);
  close(resized.width, box.width);
  close(resized.height, box.height);
  h.layout.destroy();
});

test('keyboard position and handle controls move, resize, reset, and preserve native shortcuts', () => {
  const h = harness();
  assert.equal(h.key(h.position, 'ArrowRight'), true);
  assert.equal(h.root.attributes.has('data-price-default'), false);
  assert.equal(h.reset.disabled, false);
  close(h.left(), 416);
  h.key(h.position, 'ArrowUp', { shiftKey: true });
  close(h.top(), 200);
  h.key(h.position, '+');
  close(h.scale(), 1.05);
  h.key(h.position, '=');
  h.key(h.position, '-');
  close(h.scale(), 1.05);
  const before = h.position.getBoundingClientRect();
  h.key(h.handles.nw, 'ArrowUp');
  let after = h.position.getBoundingClientRect();
  close(h.scale(), 1.1);
  close(after.left + after.width, before.left + before.width);
  close(after.top + after.height, before.top + before.height);
  h.key(h.handles.nw, 'ArrowLeft');
  close(h.scale(), 1.05);
  assert.equal(h.key(h.position, 'ArrowDown', { ctrlKey: true }), false);
  assert.equal(h.key(h.position, 'PageDown'), false);
  const previousSaves = h.saved.length;
  h.key(h.position, 'Home');
  assert.equal(h.saved.length, previousSaves + 1, 'Home resets with a single preference write');
  assert.deepEqual(h.saved.at(-1), { version: 1, x: 50, y: 50, size: 100 });
  assert.equal(h.root.attributes.has('data-price-default'), true);
  assert.equal(h.reset.disabled, true);
  close(h.left(), 400);
  close(h.top(), 250);
  h.layout.destroy();
});

test('Reset price restores centered default size from saved placement and persists it independently', () => {
  const h = harness({ saved: JSON.stringify({ version: 1, x: 0, y: 100, size: 150 }) });
  assert.equal(h.left(), 0);
  close(h.scale(), 1.5);
  h.position.click();
  h.key(h.position, 'Escape');
  assert.equal(h.frame(), false);
  h.reset.click();
  close(h.left(), 400);
  close(h.top(), 250);
  close(h.scale(), 1);
  assert.deepEqual(h.saved, [{ version: 1, x: 50, y: 50, size: 100 }]);
  assert.equal(h.root.attributes.has('data-price-default'), true);
  assert.equal(h.reset.disabled, true);
  assert.equal(h.frame(), false, 'resetting from outside the price does not reveal the frame');
  h.advance(1500);
  assert.equal(h.frame(), false);
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.frame(), false);
  h.layout.destroy();
  assert.equal(h.reset.disabled, true);
});

test('Reset price ends a resize without saving it and ignores its later pointer release', () => {
  const h = harness();
  const box = h.position.getBoundingClientRect();
  const x = box.left + box.width, y = box.top + box.height;
  h.pointer('pointerdown', h.handles.se, { clientX: x, clientY: y });
  h.pointer('pointermove', h.window, { clientX: x + 100, clientY: y + 50 });
  close(h.scale(), 1.5);
  h.reset.click();
  assert.equal(h.position.captures.size, 0);
  assert.equal(h.root.attributes.has('data-price-dragging'), false);
  assert.equal(h.root.attributes.has('data-price-resizing'), false);
  assert.deepEqual(h.saved, [{ version: 1, x: 50, y: 50, size: 100 }]);
  h.pointer('pointerup', h.window, { clientX: 10000, clientY: 10000 });
  close(h.left(), 400);
  close(h.top(), 250);
  close(h.scale(), 1);
  assert.equal(h.saved.length, 1);
  h.layout.destroy();
});

test('default layout detection includes size and tolerates insignificant saved floating-point differences', () => {
  for (const [state, isDefault] of [
    [{ version: 1, x: 50, y: 50, size: 100 }, true],
    [{ version: 1, x: 50.005, y: 49.995, size: 100.005 }, true],
    [{ version: 1, x: 50, y: 50, size: 125 }, false],
    [{ version: 1, x: 50.02, y: 50, size: 100 }, false],
  ] as const) {
    const h = harness({ saved: JSON.stringify(state) });
    assert.equal(h.root.attributes.has('data-price-default'), isDefault);
    assert.equal(h.reset.disabled, isDefault);
    assert.equal(h.reset.hidden, h.reset.disabled);
    h.layout.destroy();
  }
});

test('default state follows size and drag changes and persists through saved round trips', () => {
  const h = harness();
  h.key(h.position, '+');
  assert.equal(h.root.attributes.has('data-price-default'), false);
  assert.equal(h.reset.disabled, false);
  assert.equal(h.reset.hidden, false);
  assert.equal(h.reset.textContent, 'Restore');
  h.key(h.position, '-');
  assert.equal(h.root.attributes.has('data-price-default'), true);
  const box = h.position.getBoundingClientRect();
  h.pointer('pointerdown', h.position, { clientX: box.left + 10, clientY: box.top + 10 });
  h.pointer('pointermove', h.window, { clientX: box.left + 60, clientY: box.top + 10 });
  assert.equal(h.root.attributes.has('data-price-default'), false, 'drag placement updates the flag before a preference write');
  h.pointer('pointerup', h.window, { clientX: box.left + 60, clientY: box.top + 10 });
  const restored = harness({ saved: JSON.stringify(h.saved.at(-1)) });
  close(restored.left(), h.left());
  close(restored.top(), h.top());
  assert.equal(restored.root.attributes.has('data-price-default'), false);
  assert.equal(restored.reset.disabled, false);
  restored.reset.click();
  const reset = harness({ saved: JSON.stringify(restored.saved.at(-1)) });
  assert.equal(reset.root.attributes.has('data-price-default'), true);
  assert.equal(reset.reset.disabled, true);
  h.layout.destroy(); restored.layout.destroy(); reset.layout.destroy();
});

test('reset returns focus to the price when the reset control becomes disabled', () => {
  const h = harness({ saved: JSON.stringify({ version: 1, x: 25, y: 75, size: 150 }) });
  h.focus(h.reset);
  h.reset.click();
  assert.equal(h.reset.disabled, true);
  assert.equal(h.document.activeElement, h.position);
  assert.equal(h.root.attributes.has('data-price-default'), true);
  assert.equal(h.saved.length, 1);
  h.layout.destroy();
});

test('resize observation fits oversized prices, recovers space, and avoids repeated geometry writes', () => {
  const h = harness({ viewport: { width: 320, height: 240 }, width: 600, saved: JSON.stringify({ version: 1, x: 100, y: 100, size: 200 }) });
  close(Number(h.root.style.getPropertyValue('--video-price-fit')), 4 / 15);
  close(h.left(), 0);
  close(h.top(), 560 / 3);
  assert.deepEqual(h.observed, [h.position, h.stage]);
  h.resize({ width: 1280, height: 800 });
  close(Number(h.root.style.getPropertyValue('--video-price-fit')), 1);
  close(h.left(), 80);
  close(h.top(), 600);
  const writes = h.root.style.writes + h.position.style.writes;
  h.layout.refresh(); h.notifyObserver();
  assert.equal(h.root.style.writes + h.position.style.writes, writes);
  h.resizePrice(624, 384);
  close(h.left(), 32);
  close(h.top(), 32);
  assert.equal(Number.isFinite(h.left()), true);
  h.layout.destroy();
});

test('cancel, lost capture, blur, and hiding release interaction without independent frame timers', () => {
  for (const ending of ['pointercancel', 'lostpointercapture', 'blur', 'hidden']) {
    const h = harness();
    h.position.captureFails = ending === 'blur';
    const box = h.position.getBoundingClientRect();
    h.pointer('pointerdown', h.position, { clientX: box.left + 5, clientY: box.top + 5 });
    h.pointer('pointermove', h.window, { clientX: box.left + 55, clientY: box.top + 5 });
    if (ending === 'hidden') h.visibility(true);
    else if (ending === 'blur') h.window.dispatchEvent(new Event('blur'));
    else h.pointer(ending, ending === 'lostpointercapture' ? h.position : h.window);
    assert.equal(h.root.attributes.has('data-price-dragging'), false, ending);
    assert.equal(h.position.captures.size, 0, ending);
    const left = h.left();
    h.pointer('pointermove', h.window, { clientX: 900, clientY: 500 });
    close(h.left(), left);
    assert.equal(h.saved.length, 1, ending);
    if (ending === 'hidden' || ending === 'blur') { assert.equal(h.timers.size, 0); assert.equal(h.frame(), false); }
    else { h.advance(1500); assert.equal(h.frame(), false, 'moving away from the price hides the frame'); }
    h.layout.destroy();
  }
});

test('destroy releases observers, captures, and listeners and ignores stale callbacks', () => {
  const h = harness();
  h.position.click();
  const box = h.position.getBoundingClientRect();
  h.pointer('pointerdown', h.handles.nw, { clientX: box.left, clientY: box.top });
  h.layout.destroy(); h.layout.destroy();
  assert.equal(h.root.attributes.has('data-price-layout-ready'), false);
  assert.equal(h.root.attributes.has('data-price-default'), false);
  assert.equal(h.root.attributes.has('data-price-layout-open'), false);
  assert.equal(h.root.attributes.has('data-price-dragging'), false);
  assert.equal(h.root.attributes.has('data-price-resizing'), false);
  assert.equal(h.position.captures.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.disconnects(), 1);
  assert.equal(h.position.style.left, '');
  assert.equal(h.position.style.top, '');
  assert.equal(h.root.style.getPropertyValue('--video-price-scale'), '');
  for (const element of [h.position, h.reset, h.document, h.window, ...Object.values(h.handles)]) assert.equal(element.listenerCount(), 0);
  const writes = h.root.style.writes + h.position.style.writes;
  const notifications = h.notifications();
  h.layout.refresh(); h.notifyObserver(); h.root.dispatchEvent(new Event('videouireveal')); h.advance(10000);
  h.resize({ width: 600 }); h.pointer('pointermove', h.window, { clientX: 1000 }); h.position.click(); h.reset.click();
  assert.equal(h.root.style.writes + h.position.style.writes, writes);
  assert.equal(h.notifications(), notifications);
  assert.equal(h.saved.length, 0);
});

test('reset keeps its Restore label for every layout', () => {
  const h = harness({ saved: JSON.stringify({ version: 1, x: 50, y: 50, size: 150 }) });
  assert.equal(h.reset.hidden, false, 'reset appears after resizing');
  assert.equal(h.reset.textContent, 'Restore');
  assert.equal(h.reset.title, 'Restore');
  h.key(h.position, 'ArrowRight');
  assert.equal(h.reset.hidden, false);
  assert.equal(h.reset.disabled, false);
  assert.equal(h.reset.textContent, 'Restore');
  assert.equal(h.reset.title, 'Restore');
  h.key(h.position, 'ArrowLeft');
  assert.equal(h.reset.hidden, false, 'reset remains available for a custom size');
  assert.equal(h.reset.textContent, 'Restore');
  assert.equal(h.reset.title, 'Restore');
  h.key(h.position, 'ArrowDown');
  assert.equal(h.reset.hidden, false);
  h.focus(h.reset);
  h.reset.click();
  assert.equal(h.reset.hidden, true);
  assert.equal(h.document.activeElement, h.position);
  close(h.left(), 400);
  close(h.top(), 250);
  h.layout.destroy();
  assert.equal(h.reset.hidden, true);
});

test('layout reset is enabled during dragging and disabled when snapped back to the center', () => {
  const h = harness();
  const box = h.position.getBoundingClientRect();
  h.pointer('pointerdown', h.position, { clientX: box.left + 10, clientY: box.top + 10 });
  h.pointer('pointermove', h.window, { clientX: box.left + 70, clientY: box.top + 10 });
  assert.equal(h.reset.hidden, false);
  h.pointer('pointermove', h.window, { clientX: box.left + 10, clientY: box.top + 10 });
  assert.equal(h.reset.hidden, true);
  h.pointer('pointerup', h.window, { clientX: box.left + 10, clientY: box.top + 10 });
  assert.equal(h.reset.hidden, true);
  h.layout.destroy();
});

test('layout reset restores default size and hides at default', () => {
  const h = harness({ saved: JSON.stringify({ version: 1, x: 50, y: 50, size: 150 }) });
  assert.equal(h.reset.textContent, 'Restore');
  assert.equal(h.reset.hidden, false);
  assert.equal(h.reset.disabled, false);
  h.reset.click();
  close(h.scale(), 1);
  close(h.left(), 400);
  close(h.top(), 250);
  assert.equal(h.reset.hidden, true);
  assert.equal(h.reset.disabled, true);
  assert.deepEqual(h.saved.at(-1), { version: 1, x: 50, y: 50, size: 100 });
  h.layout.destroy();
  assert.equal(h.reset.textContent, 'Restore');
  assert.equal(h.reset.title, 'Restore');
});

test('hover margin keeps all four corner handles reachable without activating away from the price', () => {
  for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
    const h = harness();
    const box = h.position.getBoundingClientRect();
    const west = corner.endsWith('w'), north = corner.startsWith('n');
    const x = box.left + (west ? 0 : box.width), y = box.top + (north ? 0 : box.height);
    const rim = { pointerType: 'mouse', clientX: x + (west ? -20 : 20), clientY: y + (north ? -20 : 20) };
    h.pointer('pointermove', h.outside, rim);
    assert.equal(h.frame(), false, 'the margin alone must not reveal the frame');
    h.pointer('pointerenter', h.position, { pointerType: 'mouse', clientX: x, clientY: y });
    h.pointer('pointerleave', h.position, rim);
    h.pointer('pointermove', h.outside, rim);
    assert.equal(h.frame(), true, corner);
    assert.equal(h.handles[corner].tabIndex, 0);
    h.pointer('pointerdown', h.handles[corner], { ...rim, clientX: x, clientY: y });
    h.pointer('pointerup', h.window, rim);
    assert.equal(h.frame(), true, 'releasing on the outer handle area retains the frame');
    const resized = h.position.getBoundingClientRect();
    h.pointer('pointermove', h.outside, { pointerType: 'mouse', clientX: resized.left - 25, clientY: resized.top + resized.height + 97 });
    assert.equal(h.frame(), false, 'leaving both price and button safe zones hides the frame');
    h.root.dispatchEvent(new Event('videouidismiss'));
    h.pointer('pointermove', h.outside, rim);
    assert.equal(h.frame(), false);
    h.layout.destroy();
  }
});

test('resizing beyond twice the default size stops only at a screen edge and restores on reload', () => {
  for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
    const h = harness();
    const box = h.position.getBoundingClientRect();
    const west = corner.endsWith('w'), north = corner.startsWith('n');
    const x = box.left + (west ? 0 : box.width), y = box.top + (north ? 0 : box.height);
    const anchorX = box.left + (west ? box.width : 0), anchorY = box.top + (north ? box.height : 0);
    h.pointer('pointerdown', h.handles[corner], { clientX: x, clientY: y });
    h.pointer('pointerup', h.window, { clientX: west ? -10000 : 10000, clientY: north ? -10000 : 10000 });
    const resized = h.position.getBoundingClientRect();
    close(h.scale(), 3);
    close(resized.left + (west ? resized.width : 0), anchorX);
    close(resized.top + (north ? resized.height : 0), anchorY);
    close(west ? resized.left : resized.left + resized.width, h.viewport.left + (west ? 0 : h.viewport.width));
    const restored = harness({ saved: JSON.stringify(h.saved.at(-1)) });
    close(restored.position.getBoundingClientRect().width, resized.width);
    close(restored.left(), h.left());
    h.layout.destroy(); restored.layout.destroy();
  }
  const h = harness();
  for (let i = 0; i < 120; i++) h.key(h.position, '+');
  close(h.position.getBoundingClientRect().width, h.viewport.width);
  h.key(h.position, '-');
  assert.ok(h.position.getBoundingClientRect().width < h.viewport.width, 'shrinking at the boundary responds immediately');
  h.layout.destroy();
});


test('vertical hover space and the full button row keep price editing reachable', () => {
  const h = harness();
  const box = h.position.getBoundingClientRect();
  h.style.rect = () => ({ left: box.left - 120, top: box.top - 70, width: 440, height: 60 });
  for (const y of [box.top - 90, box.top + box.height + 90]) {
    h.pointer('pointerenter', h.position, { pointerType: 'mouse' });
    const point = { clientX: box.left + 50, clientY: y, pointerType: 'mouse' };
    h.pointer('pointerleave', h.position, point);
    h.pointer('pointermove', h.outside, point);
    assert.equal(h.frame(), true, '96 px above and below the price remains safe');
  }
  h.pointer('pointermove', h.outside, { clientX: box.left - 100, clientY: box.top - 50, pointerType: 'mouse' });
  assert.equal(h.frame(), true, 'outer reset buttons remain reachable even for a narrow price');
  h.pointer('pointermove', h.outside, { clientX: box.left, clientY: box.top + box.height + 97, pointerType: 'mouse' });
  assert.equal(h.frame(), false);
  h.layout.destroy();
});

test('keyboard focus can move from the price into its controls and leave them normally', () => {
  const h = harness();
  h.focus(h.position);
  h.focus(h.reset);
  assert.equal(h.frame(), true, 'Tab to an editing button must keep it visible');
  h.style.dispatchEvent(Object.assign(new Event('focusout'), { relatedTarget: h.outside }));
  assert.equal(h.frame(), false);
  h.root.setAttribute('data-price-style-open', '');
  h.root.dispatchEvent(new Event('pricestyletoggle'));
  assert.equal(h.frame(), true, 'the expanded style editor keeps the editing group visible');
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.frame(), false, 'idle or manual dismissal still hides the frame');
  h.layout.destroy();
});


test('switching from keyboard focus to the pointer over an editing button keeps it clickable', () => {
  const h = harness();
  h.focus(h.position);
  const row = h.style.getBoundingClientRect();
  h.pointer('pointermove', h.reset, { pointerType: 'mouse', clientX: row.left + 20, clientY: row.top + 20 });
  assert.equal(h.frame(), true, 'switching input methods must not hide the button under the cursor');
  h.layout.destroy();
});


test('moving into the editing menu and opening currency keeps the price frame visible', () => {
  const h = harness({ editingMenu: true });
  h.pointer('pointerenter', h.position);
  assert.equal(h.frame(), true);
  h.pointer('pointermove', h.menu, { clientX: 220, clientY: 480, pointerType: 'mouse' });
  assert.equal(h.frame(), true, 'the floating menu belongs to the price hover area');
  h.root.setAttribute('data-currency-open', '');
  h.root.dispatchEvent(new Event('currencytoggle'));
  h.pointer('pointermove', h.outside, { clientX: 0, clientY: 0, pointerType: 'mouse' });
  assert.equal(h.frame(), true, 'an open currency list stays reachable outside the price');
  h.root.removeAttribute('data-currency-open');
  h.root.dispatchEvent(new Event('currencytoggle'));
  assert.equal(h.frame(), false);
  h.layout.destroy();
});


test('Restore stays available for style-only changes and notifies style restoration for clicks and Home', () => {
  const h = harness();
  let restores = 0;
  h.root.addEventListener('pricerestore', () => {
    restores++;
    h.root.removeAttribute('data-price-style-custom');
  });
  for (const action of ['click', 'Home']) {
    h.root.setAttribute('data-price-style-custom', '');
    h.layout.refresh();
    assert.equal(h.root.hasAttribute('data-price-default'), true, 'layout can be default with custom styling');
    assert.equal(h.reset.hidden, false);
    assert.equal(h.reset.disabled, false);
    if (action === 'click') { h.focus(h.reset); h.reset.click(); }
    else h.key(h.position, 'Home');
    assert.equal(h.reset.hidden, true);
    assert.equal(h.reset.disabled, true);
    assert.equal(h.document.activeElement, h.position);
    assert.deepEqual(h.saved.at(-1), { version: 1, x: 50, y: 50, size: 100 });
  }
  assert.equal(restores, 2);
  h.layout.destroy();
});
