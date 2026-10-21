import assert from 'node:assert/strict';
import test from 'node:test';
import { browserModule } from './support/browser-module.ts';
import type { createChartFullscreenControls } from '../src/lib/chart-fullscreen-controls.ts';

function harness() {
  class Surface extends EventTarget {
    id = '';
    focusVisible = false;
    attributes = new Map<string, string>();
    children = new Set<Surface>();
    contains(target: Surface) { return target === this || this.children.has(target); }
    matches(selector: string) { assert.equal(selector, ':focus-visible'); return this.focusVisible; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    hasAttribute(name: string) { return this.attributes.has(name); }
  }
  let panelOpen = false;
  let navigationOpen = false;
  const root = Object.assign(new Surface(), { querySelector: () => panelOpen ? button : null });
  const button = new Surface();
  root.children.add(button);
  const navigation = new Surface();
  const dialog = Object.assign(new Surface(), { id: 'site-navigation-dialog' });
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    activeElement: null as Surface | null,
    fullscreenElement: null as object | null,
    querySelector: (selector: string) => selector === '.nav-menu-trigger' ? navigation : navigationOpen ? dialog : null,
  });
  const window = new EventTarget();
  const timers = new Map<number, { at: number; run(): void }>();
  let now = 0;
  let nextId = 0;
  const module = browserModule('lib/chart-fullscreen-controls', {
    window, document,
    Date: class extends Date { static now() { return now; } },
    setTimeout(run: () => void, delay: number) {
      const id = ++nextId;
      timers.set(id, { at: now + delay, run });
      return id;
    },
    clearTimeout(id: number) { timers.delete(id); },
  }) as { createChartFullscreenControls: typeof createChartFullscreenControls };
  const controls = module.createChartFullscreenControls(root as unknown as HTMLElement);
  function tick(ms: number) {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].run();
    }
    now = end;
  }
  function panel(navigationPanel: boolean, open: boolean) {
    if (navigationPanel) navigationOpen = open;
    else panelOpen = open;
    const event = new Event('toggle');
    Object.defineProperty(event, 'target', { value: navigationPanel ? dialog : button });
    document.dispatchEvent(event);
  }
  return {
    root, button, navigation, document, window, timers, controls, tick, panel,
    idle: () => root.hasAttribute('data-fullscreen-idle'),
    fullscreen(value: boolean) { document.fullscreenElement = value ? {} : null; document.dispatchEvent(new Event('fullscreenchange')); },
    pointer(type = 'pointermove', pointerType = 'mouse') { window.dispatchEvent(Object.assign(new Event(type), { pointerType })); },
    focus(target: Surface | null, visible = true) {
      if (document.activeElement) {
        document.dispatchEvent(new Event('focusout'));
        document.activeElement.focusVisible = false;
      }
      document.activeElement = target;
      if (target) { target.focusVisible = visible; document.dispatchEvent(new Event('focusin')); }
    },
    visibility(hidden: boolean) { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('fullscreen entry fades controls and pointer movement restarts the full three-second delay', () => {
  const h = harness();
  h.pointer();
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.fullscreen(true);
  assert.equal(h.idle(), true);
  h.panel(false, false);
  assert.equal(h.idle(), true, 'queued settings-close events must not reveal controls on entry');
  for (const pointerType of ['mouse', 'pen']) {
    h.pointer('pointermove', pointerType);
    assert.equal(h.idle(), false);
    h.tick(2999);
    h.pointer('pointermove', pointerType);
    h.tick(2999);
    assert.equal(h.idle(), false);
    h.tick(1);
    assert.equal(h.idle(), true);
  }
  h.fullscreen(false);
  assert.equal(h.idle(), false);
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
});

test('entry focus, clicks, touch, and lifecycle events cannot reveal fullscreen controls', () => {
  const h = harness();
  h.focus(h.button);
  h.panel(false, true);
  h.fullscreen(true);
  assert.equal(h.idle(), true, 'fullscreen entry hides even keyboard-focused settings');
  h.panel(false, false);
  h.focus(null);
  h.tick(0);
  h.focus(h.button);
  h.window.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter' }));
  h.pointer('pointermove', 'touch');
  h.pointer('pointerdown');
  h.pointer('pointerup');
  h.pointer('pointercancel');
  h.visibility(true);
  h.visibility(false);
  h.tick(10000);
  assert.equal(h.idle(), true);
  assert.equal(h.timers.size, 0);
});

test('clicks and retained entry focus do not extend the three-second mouse reveal', () => {
  const h = harness();
  h.fullscreen(true);
  h.focus(h.button);
  h.pointer();
  h.tick(2000);
  h.pointer('pointerdown');
  h.pointer('pointerup');
  h.focus(h.navigation);
  h.tick(999);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
});

test('keyboard access reveals the UI and protects focused chart and navigation controls', () => {
  for (const target of ['button', 'navigation'] as const) {
    const h = harness();
    h.fullscreen(true);
    h.window.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Tab' }));
    assert.equal(h.idle(), false);
    h.focus(h[target]);
    h.pointer();
    h.tick(10000);
    assert.equal(h.idle(), false);
    assert.equal(h.timers.size, 0);
    h.focus(null);
    h.tick(0);
    assert.equal(h.idle(), true);
  }
});

test('open chart panels and navigation stay usable without creating a new mouse reveal', () => {
  for (const navigation of [false, true]) {
    const h = harness();
    h.fullscreen(true);
    h.pointer();
    h.panel(navigation, true);
    h.tick(10000);
    assert.equal(h.idle(), false);
    assert.equal(h.timers.size, 0);
    h.panel(navigation, false);
    assert.equal(h.idle(), true);
  }
});

test('background tabs stop idle work without restarting the mouse reveal, and destruction removes listeners', () => {
  const h = harness();
  h.fullscreen(true);
  h.pointer();
  h.visibility(true);
  assert.equal(h.timers.size, 0);
  h.tick(10000);
  h.visibility(false);
  assert.equal(h.idle(), true);
  h.pointer();
  h.controls.destroy();
  assert.equal(h.timers.size, 0);
  h.fullscreen(true);
  h.pointer();
  h.window.dispatchEvent(new Event('keydown'));
  h.focus(h.button);
  h.panel(true, true);
  h.visibility(false);
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
});
