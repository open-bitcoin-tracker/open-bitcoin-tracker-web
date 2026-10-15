import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/chart-controls.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  const settings = { open: false };
  const button = { focusVisible: true, matches: () => button.focusVisible };
  const navigationTrigger = { focusVisible: true, matches: () => navigationTrigger.focusVisible };
  const root = Object.assign(new EventTarget(), {
    attributes: new Set<string>(),
    querySelector: () => settings,
    hasAttribute(name: string) { return this.attributes.has(name); },
    setAttribute(name: string) { this.attributes.add(name); },
    removeAttribute(name: string) { this.attributes.delete(name); },
    contains: (element: unknown) => element === button,
  });
  let navigationOpen = false;
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    activeElement: null as typeof button | null,
    querySelector: (selector: string) => selector === '.nav-menu-trigger' ? navigationTrigger : navigationOpen ? {} : null,
  });
  let time = 0;
  let nextTimer = 0;
  const timers = new Map<number, { due: number; run(): void }>();
  const window = Object.assign(new EventTarget(), {
    setTimeout(run: () => void, delay: number) {
      const id = ++nextTimer;
      timers.set(id, { due: time + delay, run });
      return id;
    },
    clearTimeout(id: number) { timers.delete(id); },
  });
  const module = { createChartControls: null as unknown as (root: unknown) => { destroy(): void } };
  runInNewContext(script, { exports: module, window, document });
  const controls = module.createChartControls(root);
  const pointer = (type: string, pointerType = 'mouse', pointerId = 1) => {
    window.dispatchEvent(Object.assign(new Event(type), { pointerType, pointerId }));
  };
  const tick = (milliseconds: number) => {
    time += milliseconds;
    for (const [id, timer] of timers) {
      if (timer.due > time) continue;
      timers.delete(id);
      timer.run();
    }
  };
  return {
    root, document, window, settings, controls, timers, button, navigationTrigger, pointer, tick,
    idle: () => root.hasAttribute('data-chart-ui-idle'),
    tap() { pointer('pointerdown', 'touch'); pointer('pointerup', 'touch'); },
    key() { window.dispatchEvent(new Event('keydown')); },
    navigation(open: boolean) { navigationOpen = open; document.dispatchEvent(new Event('toggle')); },
    currency(open: boolean) {
      if (open) root.setAttribute('data-currency-open');
      else root.removeAttribute('data-currency-open');
      root.dispatchEvent(new Event('currencytoggle'));
    },
  };
}

test('chart controls start hidden, reveal on mouse movement or touch taps, and fade after 1.5 seconds of inactivity', () => {
  const h = harness();
  assert.equal(h.idle(), true);
  assert.equal(h.timers.size, 0);
  h.pointer('pointermove');
  assert.equal(h.idle(), false);
  h.tick(1499);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.tap();
  assert.equal(h.idle(), false);
  h.tick(1000);
  h.tap();
  h.tick(1499);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('dragging a chart or range pill keeps controls visible until all pointers release or cancel', () => {
  const h = harness();
  h.pointer('pointerdown', 'touch', 1);
  h.pointer('pointerdown', 'touch', 2);
  h.tick(10000);
  assert.equal(h.idle(), false);
  h.pointer('pointerup', 'touch', 1);
  h.tick(10000);
  assert.equal(h.idle(), false);
  h.pointer('pointercancel', 'touch', 2);
  h.tick(1500);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('currency, scale and navigation menus stay visible while open and resume fading when closed', () => {
  const h = harness();
  for (const toggle of [
    (open: boolean) => h.currency(open),
    (open: boolean) => { h.settings.open = open; h.document.dispatchEvent(new Event('toggle')); },
    (open: boolean) => h.navigation(open),
  ]) {
    toggle(true);
    h.tick(10000);
    assert.equal(h.idle(), false);
    assert.equal(h.timers.size, 0);
    toggle(false);
    h.tick(1500);
    assert.equal(h.idle(), true);
  }
  h.controls.destroy();
});

test('keyboard focus keeps controls visible without making pointer-focused buttons stay visible forever', () => {
  const h = harness();
  h.key();
  h.document.activeElement = h.button;
  h.document.dispatchEvent(new Event('focusin'));
  h.pointer('pointermove');
  h.tick(10000);
  assert.equal(h.idle(), false);
  h.document.activeElement = null;
  h.document.dispatchEvent(new Event('focusout'));
  h.tick(1500);
  assert.equal(h.idle(), true);
  h.document.activeElement = h.button;
  h.tap();
  h.tick(1500);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('keyboard focus on the burger keeps all controls visible until focus leaves navigation', () => {
  const h = harness();
  h.key();
  h.document.activeElement = h.navigationTrigger;
  h.document.dispatchEvent(new Event('focusin'));
  h.tick(10000);
  assert.equal(h.idle(), false);
  h.document.activeElement = null;
  h.document.dispatchEvent(new Event('focusin'));
  h.tick(1500);
  assert.equal(h.idle(), true);
  h.document.activeElement = h.navigationTrigger;
  h.tap();
  h.tick(1500);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('fullscreen reveals controls, while leaving the page clears active pointers and timers', () => {
  const h = harness();
  h.document.dispatchEvent(new Event('fullscreenchange'));
  assert.equal(h.idle(), false);
  h.pointer('pointerdown');
  h.document.hidden = true;
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.idle(), true);
  assert.equal(h.timers.size, 0);
  h.pointer('pointermove');
  assert.equal(h.idle(), true);
  h.document.hidden = false;
  h.document.dispatchEvent(new Event('visibilitychange'));
  h.tap();
  h.tick(1500);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('destroy cancels pending fades and removes event handlers', () => {
  const h = harness();
  h.tap();
  const stale = [...h.timers.values()][0].run;
  h.controls.destroy();
  assert.equal(h.timers.size, 0);
  h.root.setAttribute('data-chart-ui-idle');
  h.tap();
  h.key();
  h.currency(false);
  assert.equal(h.idle(), true);
  h.root.removeAttribute('data-chart-ui-idle');
  stale();
  assert.equal(h.idle(), false);
});
