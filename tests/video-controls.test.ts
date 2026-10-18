import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { createVideoControls } from '../src/lib/video-controls.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/video-controls.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ finePointer = true, hidden = false } = {}) {
  class Surface extends EventTarget {
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
    listenerCount() { return Array.from(this.listeners.values()).reduce((sum, listeners) => sum + listeners.size, 0); }
  }
  const button = {
    focusVisible: false,
    editable: false,
    range: false,
    select: false,
    price: false,
    style: false,
    interactive: true,
    matches(selector: string) {
      if (selector === ':focus-visible') return this.focusVisible;
      return this.editable || (this.range && !selector.includes('[type="range"]'));
    },
    closest(selector: string) {
      if (selector === 'select') return this.select ? this : null;
      if (selector === '[data-price-position], [data-price-style]') return this.price || this.style ? this : null;
      return this.interactive ? this : null;
    },
  };
  const background = { ...button, interactive: false };
  const dock = {
    inert: false,
    box: { left: 300, right: 700, top: 484, bottom: 584, width: 400, height: 100 },
    getBoundingClientRect() { return this.box; },
  };
  const price = {
    box: { left: 300, right: 700, top: 200, bottom: 300, width: 400, height: 100 },
    getBoundingClientRect() { return this.box; },
  };
  const root = Object.assign(new Surface(), {
    querySelector(selector: string) {
      if (selector === '.video-dock') return dock;
      assert.equal(selector, '[data-price-position]');
      return price;
    },
    toggleAttribute(name: string, force: boolean) { if (force) this.attributes.set(name, ''); else this.attributes.delete(name); },
    attributes: new Map<string, string>(),
    contains(element: unknown) { return element === button || element === background; },
    setAttribute(name: string, value: string) { this.attributes.set(name, value); },
    removeAttribute(name: string) { this.attributes.delete(name); },
    hasAttribute(name: string) { return this.attributes.has(name); },
  });
  let dialogOpen = false;
  let menuClass = false;
  const document = Object.assign(new Surface(), {
    hidden,
    activeElement: null as typeof button | null,
    documentElement: { classList: { contains(name: string) { assert.equal(name, 'nav-menu-open'); return menuClass; } } },
    querySelector(selector: string) { assert.equal(selector, '#site-navigation-dialog[open]'); return dialogOpen ? {} : null; },
  });
  const cursor = Object.assign(new Surface(), { matches: finePointer });
  const timers = new Map<number, { due: number; run(): void }>();
  let now = 0;
  let nextId = 0;
  const window = Object.assign(new Surface(), {
    innerHeight: 600,
    matchMedia(query: string) {
      assert.equal(query, '(hover: hover) and (pointer: fine)');
      return cursor;
    },
    setTimeout(run: () => void, delay: number) {
      const id = ++nextId;
      timers.set(id, { due: now + delay, run });
      return id;
    },
    clearTimeout(id: number) { timers.delete(id); },
  });
  let observedResize: (() => void) | undefined;
  let disconnected = false;
  const observed: unknown[] = [];
  class Observer {
    constructor(callback: () => void) { observedResize = callback; }
    observe(element: unknown) { observed.push(element); }
    disconnect() { disconnected = true; }
  }
  const module: { createVideoControls?: typeof createVideoControls } = {};
  runInNewContext(script, { exports: module, window, document, Event, Date: { now: () => now }, ResizeObserver: Observer });
  const controls = module.createVideoControls!(root as unknown as HTMLElement);

  function tick(milliseconds: number) {
    const end = now + milliseconds;
    while (true) {
      const entry = Array.from(timers.entries()).filter(([, timer]) => timer.due <= end)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!entry) break;
      timers.delete(entry[0]);
      now = entry[1].due;
      entry[1].run();
    }
    now = end;
  }
  const pointer = (type: 'pointermove' | 'pointerdown', pointerType = 'mouse', target?: typeof button) => {
    const event = Object.assign(new Event(type), { pointerType });
    if (target) Object.defineProperty(event, 'target', { value: target });
    window.dispatchEvent(event);
  };
  const focus = ({ visible = false, editable = false } = {}) => {
    button.focusVisible = visible;
    button.editable = editable;
    document.activeElement = button;
    root.dispatchEvent(new Event('focusin'));
  };
  const blur = () => { document.activeElement = null; root.dispatchEvent(new Event('focusout')); };
  const visibility = (value: boolean) => { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  const device = (value: boolean) => { cursor.matches = value; cursor.dispatchEvent(new Event('change')); };
  const menu = (open: boolean, { classOnly = false, event = 'toggle' } = {}) => {
    dialogOpen = !classOnly && open;
    menuClass = classOnly && open;
    document.dispatchEvent(new Event(event));
  };
  const key = () => window.dispatchEvent(new Event('keydown'));
  const idle = () => root.attributes.has('data-ui-idle');
  const click = (target = background) => {
    const event = new Event('click', { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    root.dispatchEvent(event);
    if (!event.cancelBubble) window.dispatchEvent(event);
    return event;
  };
  return { controls, root, dock, price, observed, resizeObserved: () => observedResize?.(), disconnected: () => disconnected, button, background, click, window, document, cursor, timers, tick, pointer, focus, blur, visibility, device, menu, key, idle };
}

test('an open price style panel prevents idle hiding until dismissed', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.root.setAttribute('data-price-style-open', '');
  h.root.dispatchEvent(new Event('pricestyletoggle'));
  h.tick(10000);
  assert.equal(h.idle(), false);
  h.root.removeAttribute('data-price-style-open');
  h.root.dispatchEvent(new Event('pricestyletoggle'));
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('Video Mode hides the interface after 1.2 seconds only when enabled', () => {
  const h = harness();
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.setEnabled(true);
  h.tick(1199);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});

test('a background click dismisses UI until cursor movement or keyboard input, despite close and focus events', () => {
  const h = harness();
  h.controls.setEnabled(true);
  let dismissals = 0;
  h.root.addEventListener('videouidismiss', () => {
    dismissals++;
    h.root.dispatchEvent(new Event('pricestyletoggle'));
  });
  h.click();
  assert.equal(h.idle(), true);
  assert.equal(dismissals, 1);
  h.root.dispatchEvent(new Event('focusout'));
  h.tick(10000);
  assert.equal(h.idle(), true);
  assert.equal(h.timers.size, 0);
  h.pointer('pointermove');
  assert.equal(h.idle(), false);
  h.click();
  h.key();
  assert.equal(h.idle(), false);
  h.controls.destroy();
});

test('editing dismissal restores playback while Style controls remain interactive', () => {
  const h = harness();
  h.root.addEventListener('videouidismiss', () => h.root.removeAttribute('data-price-layout-open'));
  h.root.addEventListener('videouireveal', () => h.root.setAttribute('data-price-layout-open', ''));
  h.controls.setEnabled(true);
  assert.equal(h.root.hasAttribute('data-price-layout-open'), true);
  h.button.style = true;
  h.click(h.button);
  assert.equal(h.idle(), false);
  h.button.style = false;
  h.click(h.button);
  assert.equal(h.idle(), false, 'playback and currency controls must not dismiss the UI');
  assert.equal(h.root.hasAttribute('data-price-layout-open'), true);
  h.tick(10000);
  assert.equal(h.idle(), false, 'editing keeps playback available');
  assert.equal(h.root.hasAttribute('data-price-layout-open'), true);
  h.click();
  assert.equal(h.idle(), false, 'ending editing restores playback controls');
  assert.equal(h.root.hasAttribute('data-price-layout-open'), false);
  h.controls.destroy();
});

test('clicking the navigation summary or its icon does not dismiss the video UI', () => {
  const h = harness();
  h.controls.setEnabled(true);
  // Both the summary and its nested SVG resolve to the summary ancestor.
  h.button.closest = selector => selector.split(', ').includes('summary') ? h.button : null;
  h.background.closest = selector => h.button.closest(selector);
  for (const target of [h.button, h.background]) {
    h.click(target);
    assert.equal(h.idle(), false);
  }
  h.menu(true);
  h.tick(10000);
  assert.equal(h.idle(), false, 'the open navigation keeps the UI visible');
  h.controls.destroy();
});

test('editing leaves playback controls interactive and keeps the interface awake', () => {
  const h = harness();
  h.root.setAttribute('data-price-layout-open', '');
  h.root.dispatchEvent(new Event('priceeditortoggle'));
  assert.equal(h.dock.inert, false);
  h.root.removeAttribute('data-price-layout-open');
  h.root.dispatchEvent(new Event('priceeditortoggle'));
  assert.equal(h.dock.inert, false);
  h.root.setAttribute('data-price-layout-open', '');
  h.root.dispatchEvent(new Event('priceeditortoggle'));
  h.controls.destroy();
  assert.equal(h.dock.inert, false);
});

test('touch background dismissal restores playback controls and their normal idle delay', () => {
  const h = harness({ finePointer: false });
  h.root.addEventListener('videouidismiss', () => h.root.removeAttribute('data-price-layout-open'));
  h.controls.setEnabled(true);
  h.root.setAttribute('data-price-layout-open', '');
  h.tick(1000);
  h.pointer('pointerdown', 'touch', h.background);
  h.click();
  assert.equal(h.idle(), false);
  assert.equal(h.root.hasAttribute('data-price-layout-open'), false);
  h.tick(1199);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('ending editing restores playback without reopening the editor and gives a fresh idle delay', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(1000);
  h.root.setAttribute('data-price-layout-open', '');
  let reveals = 0;
  h.root.addEventListener('videouireveal', () => { reveals++; });
  h.root.removeAttribute('data-price-layout-open');
  h.root.dispatchEvent(new Event('priceeditortoggle'));
  const escape = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
  escape.preventDefault();
  h.window.dispatchEvent(escape);
  assert.equal(h.idle(), false);
  assert.equal(reveals, 0, 'restoration must not re-enter editing through retained focus');
  h.tick(1199);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('mouse and pen movement reveal the interface and restart the full idle delay', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(2000);
  h.pointer('pointermove');
  h.tick(1199);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.pointer('pointermove', 'pen');
  assert.equal(h.idle(), false);
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.pointer('pointerdown');
  assert.equal(h.idle(), false);
  h.controls.destroy();
});

test('keyboard focus protects controls across mouse movement and restarts idle after focus leaves', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(1200);
  h.key();
  assert.equal(h.idle(), false);
  h.focus({ visible: true });
  h.pointer('pointermove');
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.blur();
  h.tick(1199);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('pointer submission does not preserve inherited focus-visible on the change-video button', () => {
  const h = harness();
  h.key();
  h.focus({ visible: true, editable: true });
  h.pointer('pointerdown');
  h.controls.setEnabled(true);
  h.focus({ visible: true });
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.key();
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});

test('mouse-focused editable controls stay visible until focus leaves', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.pointer('pointerdown');
  h.focus({ editable: true });
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.blur();
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('a pointer-focused seek range can fade after change while keyboard focus keeps it visible', () => {
  const h = harness();
  h.button.range = true;
  h.controls.setEnabled(true);
  h.pointer('pointerdown', 'mouse', h.button);
  h.focus();
  h.root.dispatchEvent(new Event('change'));
  h.tick(1199);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true, 'retained pointer focus must not permanently reveal the seek bar');
  h.key();
  h.focus({ visible: true });
  h.root.dispatchEvent(new Event('change'));
  h.pointer('pointermove');
  h.tick(10000);
  assert.equal(h.idle(), false, 'keyboard focus must protect the seek bar after changing time');
  assert.equal(h.timers.size, 0);
  h.blur();
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('a mouse-open native select stays visible until change and then fades with retained focus', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.button.select = true;
  h.pointer('pointerdown', 'mouse', h.button);
  h.focus();
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.root.dispatchEvent(new Event('change'));
  h.tick(1199);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('keyboard-focused native selects remain visible after changing their value', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.button.select = true;
  h.key();
  h.focus({ visible: true });
  h.root.dispatchEvent(new Event('change'));
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.blur();
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('the custom currency dropdown stays visible while open and restarts idle when dismissed', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.root.setAttribute('data-currency-open', '');
  h.root.dispatchEvent(new Event('currencytoggle'));
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.root.removeAttribute('data-currency-open');
  h.root.dispatchEvent(new Event('currencytoggle'));
  h.tick(1199);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('dragging or resizing keeps the interface awake until the interaction ends', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.root.setAttribute('data-price-dragging', '');
  h.root.dispatchEvent(new Event('pricelayoutchange'));
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.root.removeAttribute('data-price-dragging');
  h.root.dispatchEvent(new Event('pricelayoutchange'));
  h.tick(1199);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('an open price editor prevents idle fading until editing ends', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(1000);
  h.root.setAttribute('data-price-layout-open', '');
  h.root.dispatchEvent(new Event('priceeditortoggle'));
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.root.removeAttribute('data-price-layout-open');
  h.root.dispatchEvent(new Event('priceeditortoggle'));
  h.tick(1199);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true, 'normal idle fading resumes after editing');
  h.controls.destroy();
});

test('touch devices fade after the same idle delay and a tap reveals the UI for a fresh delay', () => {
  for (const finePointer of [false, true]) {
    const h = harness({ finePointer });
    h.controls.setEnabled(true);
    h.tick(1199);
    assert.equal(h.idle(), false);
    h.tick(1);
    assert.equal(h.idle(), true);
    h.pointer('pointerdown', 'touch', h.background);
    h.click();
    assert.equal(h.idle(), false, 'a tap reveals idle controls without immediately dismissing them again');
    h.tick(1199);
    assert.equal(h.idle(), false);
    h.tick(1);
    assert.equal(h.idle(), true);
    h.pointer('pointerdown', 'touch', h.button);
    h.focus({ visible: true });
    h.tick(1200);
    assert.equal(h.idle(), true, 'touch focus must not permanently pin the UI');
    h.controls.destroy();
  }
});

test('opening navigation outside the page root protects controls and closing restarts idle', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(1200);
  h.menu(true);
  assert.equal(h.idle(), false);
  h.tick(10000);
  assert.equal(h.timers.size, 0);
  assert.equal(h.idle(), false);
  h.menu(false, { event: 'close' });
  h.tick(1199);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.menu(true, { classOnly: true });
  h.tick(10000);
  assert.equal(h.idle(), false);
  h.menu(false, { event: 'close' });
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('idle timeout checks current menu and focus state without polling while blocked', () => {
  const h = harness();
  h.controls.setEnabled(true);
  // Opening the dialog in a target toggle listener happens after document capture.
  h.menu(false);
  h.document.querySelector = () => ({});
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});

test('background tabs wait for visibility and fullscreen changes reveal idle controls', () => {
  const h = harness({ hidden: true });
  h.controls.setEnabled(true);
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.visibility(false);
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.document.dispatchEvent(new Event('fullscreenchange'));
  assert.equal(h.idle(), false);
  h.tick(1000);
  h.visibility(true);
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});

test('disabling shows controls, repeated state updates do not delay idle, and reveal starts a fresh delay', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(2000);
  h.controls.setEnabled(true);
  h.tick(500);
  assert.equal(h.idle(), true);
  h.controls.setEnabled(true);
  assert.equal(h.idle(), true);
  h.controls.reveal();
  assert.equal(h.idle(), false);
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.controls.setEnabled(false);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.tick(10000);
  assert.equal(h.idle(), false);
  h.controls.destroy();
});

test('destroy clears listeners and timers, restores the UI, and guards stale callbacks', () => {
  const h = harness();
  h.controls.setEnabled(true);
  const staleTimer = Array.from(h.timers.values())[0].run;
  h.tick(1200);
  assert.equal(h.idle(), true);
  h.controls.destroy();
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  for (const surface of [h.window, h.document, h.root, h.cursor]) assert.equal(surface.listenerCount(), 0);
  staleTimer();
  h.controls.setEnabled(false);
  h.controls.setEnabled(true);
  h.controls.reveal();
  h.pointer('pointermove');
  h.visibility(false);
  h.focus();
  h.menu(false);
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});

test('the price center entering the lower 40 percent moves playback to the top', () => {
  const h = harness();
  const atTop = () => h.root.hasAttribute('data-video-controls-top');
  const moved = () => h.root.dispatchEvent(new Event('pricelayoutchange'));
  assert.equal(atTop(), false);
  h.price.box.top = 309;
  moved();
  assert.equal(atTop(), false, 'a center just above 60 percent keeps controls at the bottom');
  h.price.box.top = 310;
  moved();
  assert.equal(atTop(), true, 'a center exactly at 60 percent moves controls up');
  Object.assign(h.dock.box, { top: 16, bottom: 116 });
  moved();
  assert.equal(atTop(), true, 'dock position does not change the screen threshold');
  h.price.box.top = 309;
  moved();
  assert.equal(atTop(), false, 'moving the center above the threshold restores the bottom dock');
  Object.assign(h.price.box, { left: 800, right: 1000, top: 500 });
  moved();
  assert.equal(atTop(), true, 'horizontal placement does not change the lower-screen rule');
  h.controls.destroy();
});

test('editing and expanded menus leave playback interactive without determining placement', () => {
  const h = harness();
  h.controls.setEnabled(true);
  for (const attribute of ['data-price-layout-open', 'data-price-style-open', 'data-currency-open']) {
    h.root.setAttribute(attribute, '');
  }
  for (const event of ['priceeditortoggle', 'pricestyletoggle', 'currencytoggle']) h.root.dispatchEvent(new Event(event));
  h.resizeObserved();
  h.tick(10000);
  assert.equal(h.dock.inert, false);
  assert.equal(h.idle(), false);
  assert.equal(h.root.hasAttribute('data-video-controls-top'), false, 'menus never determine placement');
  h.price.box.top = 500;
  h.root.dispatchEvent(new Event('pricelayoutchange'));
  assert.equal(h.root.hasAttribute('data-video-controls-top'), true);
  assert.equal(h.dock.inert, false, 'moving the dock during editing keeps it interactive');
  for (const attribute of ['data-price-layout-open', 'data-price-style-open', 'data-currency-open']) h.root.removeAttribute(attribute);
  h.root.dispatchEvent(new Event('priceeditortoggle'));
  assert.equal(h.root.hasAttribute('data-video-controls-top'), true);
  h.controls.destroy();
});

test('placement follows viewport and price size changes while ignoring dock dimensions', () => {
  const h = harness();
  assert.deepEqual(h.observed, [h.price]);
  h.price.box.top = 310;
  h.resizeObserved();
  assert.equal(h.root.hasAttribute('data-video-controls-top'), true);
  h.window.innerHeight = 700;
  h.window.dispatchEvent(new Event('resize'));
  assert.equal(h.root.hasAttribute('data-video-controls-top'), false);
  h.window.innerHeight = 500;
  h.window.dispatchEvent(new Event('resize'));
  assert.equal(h.root.hasAttribute('data-video-controls-top'), true);
  h.window.innerHeight = 600;
  Object.assign(h.price.box, { top: 200, height: 240 });
  h.resizeObserved();
  assert.equal(h.root.hasAttribute('data-video-controls-top'), false);
  h.price.box.height = 340;
  h.resizeObserved();
  assert.equal(h.root.hasAttribute('data-video-controls-top'), true);
  h.dock.box.height = 0;
  h.resizeObserved();
  assert.equal(h.root.hasAttribute('data-video-controls-top'), true, 'hidden playback has the same screen-based placement');
  h.controls.destroy();
  assert.equal(h.disconnected(), true);
  assert.equal(h.root.hasAttribute('data-video-controls-top'), false);
  h.resizeObserved();
  h.window.dispatchEvent(new Event('resize'));
  assert.equal(h.root.hasAttribute('data-video-controls-top'), false);
});


test('a first tap reveals hidden UI without playback; the next visible tap can toggle playback', () => {
  for (const pointerType of ['touch', 'mouse', 'pen']) {
    for (const onPrice of [false, true]) {
      const h = harness({ finePointer: pointerType === 'mouse' });
      h.controls.setEnabled(true);
      let playbackToggles = 0;
      h.root.addEventListener('click', event => { if (!event.defaultPrevented) playbackToggles++; });
      h.tick(1200);
      assert.equal(h.idle(), true);
      h.button.price = onPrice;
      const target = onPrice ? h.button : h.background;
      h.pointer('pointerdown', pointerType, target);
      assert.equal(h.idle(), false);
      const first = h.click(target);
      assert.equal(first.defaultPrevented, true);
      assert.equal(first.cancelBubble, true);
      assert.equal(playbackToggles, 0);
      assert.equal(h.idle(), false);
      h.pointer('pointerdown', pointerType, target);
      assert.equal(h.click(target).defaultPrevented, false);
      assert.equal(playbackToggles, 1);
      h.controls.destroy();
    }
  }
});


test('a mouse click that first moves the pointer to reveal UI cannot also toggle playback', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(1200);
  h.pointer('pointermove');
  h.tick(100);
  h.pointer('pointerdown');
  assert.equal(h.click().defaultPrevented, true);
  assert.equal(h.idle(), false);
  h.pointer('pointerdown');
  assert.equal(h.click().defaultPrevented, false);
  h.tick(1200);
  h.pointer('pointermove');
  h.tick(250);
  h.pointer('pointerdown');
  assert.equal(h.click().defaultPrevented, false, 'a completed reveal leaves clicks available');
  h.controls.destroy();
});
