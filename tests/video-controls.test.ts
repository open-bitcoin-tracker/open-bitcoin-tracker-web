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
    matches(selector: string) {
      if (selector === ':focus-visible') return this.focusVisible;
      return this.editable || (this.range && !selector.includes('[type="range"]'));
    },
    closest(selector: string) { assert.equal(selector, 'select'); return this.select ? this : null; },
  };
  const root = Object.assign(new Surface(), {
    attributes: new Map<string, string>(),
    contains(element: unknown) { return element === button; },
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
  const module: { createVideoControls?: typeof createVideoControls } = {};
  runInNewContext(script, { exports: module, window, document });
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
  return { controls, root, button, window, document, cursor, timers, tick, pointer, focus, blur, visibility, device, menu, key, idle };
}

test('Video Mode hides the interface after 2.5 seconds only when enabled', () => {
  const h = harness();
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.setEnabled(true);
  h.tick(2499);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});

test('mouse and pen movement reveal the interface and restart the full idle delay', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(2000);
  h.pointer('pointermove');
  h.tick(2499);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.pointer('pointermove', 'pen');
  assert.equal(h.idle(), false);
  h.tick(2500);
  assert.equal(h.idle(), true);
  h.pointer('pointerdown');
  assert.equal(h.idle(), false);
  h.controls.destroy();
});

test('keyboard focus protects controls across mouse movement and restarts idle after focus leaves', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(2500);
  h.key();
  assert.equal(h.idle(), false);
  h.focus({ visible: true });
  h.pointer('pointermove');
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.blur();
  h.tick(2499);
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
  h.tick(2500);
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
  h.tick(2500);
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
  h.tick(2499);
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
  h.tick(2500);
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
  h.tick(2499);
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
  h.tick(2500);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('the custom currency dropdown stays visible while open and restarts idle when dismissed', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(2500);
  assert.equal(h.idle(), true);
  h.root.setAttribute('data-currency-open', '');
  h.root.dispatchEvent(new Event('currencytoggle'));
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.root.removeAttribute('data-currency-open');
  h.root.dispatchEvent(new Event('currencytoggle'));
  h.tick(2499);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('touch devices and touch interaction keep controls visible until a cursor is used', () => {
  const h = harness({ finePointer: false });
  h.controls.setEnabled(true);
  h.pointer('pointermove', 'touch');
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.device(true);
  h.tick(2500);
  assert.equal(h.idle(), true);
  h.pointer('pointerdown', 'touch');
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.pointer('pointermove');
  h.tick(2500);
  assert.equal(h.idle(), true);
  h.device(false);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});

test('opening navigation outside the page root protects controls and closing restarts idle', () => {
  const h = harness();
  h.controls.setEnabled(true);
  h.tick(2500);
  h.menu(true);
  assert.equal(h.idle(), false);
  h.tick(10000);
  assert.equal(h.timers.size, 0);
  assert.equal(h.idle(), false);
  h.menu(false, { event: 'close' });
  h.tick(2499);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.menu(true, { classOnly: true });
  h.tick(10000);
  assert.equal(h.idle(), false);
  h.menu(false, { event: 'close' });
  h.tick(2500);
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
  h.tick(2500);
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
  h.tick(2500);
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
  h.tick(2500);
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
