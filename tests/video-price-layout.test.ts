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
interface Options { saved?: string; blockedStorage?: boolean; viewport?: Partial<Rect>; width?: number; height?: number; observer?: boolean }
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
    click() { if (position.contains(this)) position.dispatchEvent(targetEvent('click', this)); else this.dispatchEvent(new Event('click')); }
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
  const reset = root.append(new Element());
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
  position.rect = () => {
    const scale = Number(root.style.getPropertyValue('--video-price-scale') || 1);
    const fit = Number(root.style.getPropertyValue('--video-price-fit') || 1);
    return { left: viewport.left + (Number.parseFloat(position.style.left) || 0), top: viewport.top + (Number.parseFloat(position.style.top) || 0), width: naturalWidth * scale * fit, height: naturalHeight * scale * fit };
  };
  root.selectors.set('[data-price-stage]', stage);
  root.selectors.set('[data-price-position]', position);
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
    root, stage, position, reset, handles, document, window, outside, saved, layout, viewport, observed, timers,
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
      if (surface === position && type === 'pointermove') window.dispatchEvent(event);
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
  assert.equal(Object.values(h.handles).every(handle => handle.tabIndex === 0), true);
  assert.equal(h.frame(), true);
  h.layout.destroy();
  const restored = harness({ saved: JSON.stringify({ version: 1, x: -20, y: 130, size: 300 }) });
  assert.equal(restored.left(), 16);
  assert.equal(restored.top(), 384);
  assert.equal(restored.scale(), 2);
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
  close(blocked.left(), 415.36);
  blocked.layout.destroy();
});

test('the frame starts visible and follows page UI dismissal and reveal without its own timeout', () => {
  const h = harness();
  assert.equal(h.frame(), true);
  assert.equal(Object.values(h.handles).every(handle => handle.tabIndex === 0), true);
  h.advance(10000);
  assert.equal(h.frame(), true, 'the frame stays visible as long as the page UI does');
  assert.equal(h.timers.size, 0);
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.frame(), false);
  assert.equal(Object.values(h.handles).every(handle => handle.tabIndex === -1), true);
  h.root.dispatchEvent(new Event('videouireveal'));
  assert.equal(h.frame(), true);
  assert.equal(Object.values(h.handles).every(handle => handle.tabIndex === 0), true);
  assert.equal(h.notifications(), 0, 'frame show/hide must not restart the page idle timer');
  h.layout.destroy();
});

test('UI dismissal closes the price frame without reopening it on hover or stale focus', () => {
  const h = harness();
  h.focus(h.position);
  assert.equal(h.frame(), true);
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.frame(), false);
  h.pointer('pointermove', h.position);
  h.window.dispatchEvent(new Event('focus'));
  assert.equal(h.frame(), false);
  h.position.click();
  assert.equal(h.frame(), true);
  h.root.setAttribute('data-price-style-open', '');
  h.root.dispatchEvent(new Event('pricestyletoggle'));
  h.advance(10000);
  assert.equal(h.frame(), true, 'style controls must remain available while their panel is open');
  h.layout.destroy();
});

test('keyboard focus and blur leave the frame following page UI visibility', () => {
  const h = harness();
  h.focus(h.position);
  h.advance(10000);
  assert.equal(h.frame(), true);
  assert.equal(h.timers.size, 0);
  h.focus(h.handles.ne);
  h.advance(10000);
  assert.equal(h.frame(), true);
  h.focus(h.outside, false);
  h.advance(1499);
  assert.equal(h.frame(), true);
  h.advance(1);
  assert.equal(h.frame(), true);
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.frame(), false);
  h.layout.destroy();
});

test('Escape hides focused handles without reopening and safely ends an active resize', () => {
  const h = harness();
  assert.equal(h.key(h.outside, 'Escape'), false, 'navigation outside the page root keeps its own Escape behavior');
  assert.equal(h.frame(), true);
  let dismissals = 0;
  h.root.addEventListener('videouihide', () => { dismissals++; });
  h.focus(h.position);
  h.focus(h.handles.ne);
  assert.equal(h.key(h.handles.ne, 'Escape'), true);
  assert.equal(h.frame(), false);
  assert.equal(dismissals, 1, 'Escape asks the page controls to hide with the frame');
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
  h.position.click();
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
  assert.equal(h.left(), 784);
  assert.equal(h.top(), 16);
  assert.equal(h.root.attributes.has('data-price-dragging'), false);
  assert.equal(h.position.hasPointerCapture(1), false);
  assert.deepEqual(h.saved.at(-1), { version: 1, x: 100, y: 0, size: 100 });
  assert.equal(h.saved.length, 1);
  assert.equal(h.notifications(), 2);
  h.advance(1500);
  assert.equal(h.frame(), true);
  h.root.dispatchEvent(new Event('videouidismiss'));
  assert.equal(h.frame(), false);
  h.layout.destroy();
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

test('resize projection ignores perpendicular movement and respects size and viewport limits', () => {
  const h = harness();
  let box = h.position.getBoundingClientRect();
  const x = box.left + box.width, y = box.top + box.height;
  h.pointer('pointerdown', h.handles.se, { clientX: x, clientY: y });
  h.pointer('pointermove', h.window, { clientX: x - 50, clientY: y + 100 });
  close(h.scale(), 1);
  h.pointer('pointermove', h.window, { clientX: x + 10000, clientY: y + 10000 });
  close(h.scale(), 2);
  h.pointer('pointerup', h.window, { clientX: x - 10000, clientY: y - 10000 });
  close(h.scale(), .25);
  h.layout.destroy();

  const edge = harness({ saved: JSON.stringify({ version: 1, x: 100, y: 100, size: 100 }) });
  box = edge.position.getBoundingClientRect();
  edge.pointer('pointerdown', edge.handles.se, { clientX: box.left + box.width, clientY: box.top + box.height });
  edge.pointer('pointerup', edge.window, { clientX: 10000, clientY: 10000 });
  close(edge.scale(), 1);
  close(edge.left(), 784);
  close(edge.top(), 484);
  edge.layout.destroy();
});

test('resizing a fitted price responds immediately to inward movement without a jump', () => {
  const h = harness({ viewport: { width: 320, height: 240 }, width: 600, saved: JSON.stringify({ version: 1, x: 0, y: 50, size: 200 }) });
  const box = h.position.getBoundingClientRect();
  close(box.width, 288);
  const x = box.left + box.width, y = box.top + box.height;
  h.pointer('pointerdown', h.handles.se, { clientX: x, clientY: y });
  h.pointer('pointermove', h.window, { clientX: x - box.width * .2, clientY: y - box.height * .2 });
  const smaller = h.position.getBoundingClientRect();
  close(smaller.width, box.width * .8);
  close(smaller.height, box.height * .8);
  close(smaller.left, box.left);
  close(smaller.top, box.top);
  h.pointer('pointerup', h.window, { clientX: x - box.width * .2, clientY: y - box.height * .2 });
  close(h.saved.at(-1)!.size, 38.4);
  h.layout.destroy();
});

test('keyboard position and handle controls move, resize, reset, and preserve native shortcuts', () => {
  const h = harness();
  assert.equal(h.key(h.position, 'ArrowRight'), true);
  assert.equal(h.root.attributes.has('data-price-default'), false);
  assert.equal(h.reset.disabled, false);
  close(h.left(), 415.36);
  h.key(h.position, 'ArrowUp', { shiftKey: true });
  close(h.top(), 203.2);
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
  assert.equal(h.left(), 16);
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
  assert.equal(h.frame(), true, 'reset reveals the frame even after Escape dismissal');
  h.advance(1500);
  assert.equal(h.frame(), true);
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
    h.layout.destroy();
  }
});

test('default state follows size and drag changes and persists through saved round trips', () => {
  const h = harness();
  h.key(h.position, '+');
  assert.equal(h.root.attributes.has('data-price-default'), false);
  assert.equal(h.reset.disabled, false);
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
  close(Number(h.root.style.getPropertyValue('--video-price-fit')), .24);
  close(h.left(), 16);
  close(h.top(), 176);
  assert.deepEqual(h.observed, [h.position, h.stage]);
  h.resize({ width: 1280, height: 800 });
  close(Number(h.root.style.getPropertyValue('--video-price-fit')), 1);
  close(h.left(), 64);
  close(h.top(), 584);
  const writes = h.root.style.writes + h.position.style.writes;
  h.layout.refresh(); h.notifyObserver();
  assert.equal(h.root.style.writes + h.position.style.writes, writes);
  h.resizePrice(624, 384);
  close(h.left(), 16);
  close(h.top(), 16);
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
    else { h.advance(1500); assert.equal(h.frame(), true); }
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
