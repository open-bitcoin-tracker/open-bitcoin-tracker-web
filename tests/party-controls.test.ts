import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { createPartyControls } from '../src/lib/party-controls.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/party-controls.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ finePointer = true, hidden = false } = {}) {
  class Surface extends EventTarget {
    listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null) {
      super.addEventListener(type, callback);
      if (!callback) return;
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(callback);
    }
    removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null) {
      super.removeEventListener(type, callback);
      if (callback) this.listeners.get(type)?.delete(callback);
    }
    listenerCount() { return Array.from(this.listeners.values()).reduce((sum, listeners) => sum + listeners.size, 0); }
  }
  const button = Object.assign(new Surface(), {
    attributes: new Map<string, string>(),
    focusVisible: false,
    matches(selector: string) {
      assert.equal(selector, ':focus-visible');
      return this.focusVisible;
    },
    setAttribute(name: string, value: string) { this.attributes.set(name, value); },
    removeAttribute(name: string) { this.attributes.delete(name); },
  });
  const document = Object.assign(new Surface(), { hidden });
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
  const module: { createPartyControls?: typeof createPartyControls } = {};
  runInNewContext(script, { exports: module, window, document });
  const controls = module.createPartyControls!(button as unknown as HTMLButtonElement);

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
  const pointer = (type: 'pointermove' | 'pointerdown', pointerType = 'mouse') => {
    window.dispatchEvent(Object.assign(new Event(type), { pointerType }));
  };
  const focus = (visible: boolean) => {
    button.focusVisible = visible;
    button.dispatchEvent(new Event('focusin'));
  };
  const blur = () => { button.focusVisible = false; button.dispatchEvent(new Event('focusout')); };
  const visibility = (value: boolean) => { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  const device = (value: boolean) => { cursor.matches = value; cursor.dispatchEvent(new Event('change')); };
  const idle = () => button.attributes.has('data-idle');
  return { controls, button, window, document, cursor, timers, tick, pointer, focus, blur, visibility, device, idle };
}

test('the playback button fades after 2.5 seconds of playing even before the first pointer event', () => {
  const h = harness();
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.setPlaying(true);
  h.tick(2499);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});

test('mouse and pen movement anywhere immediately reveal the button and restart the inactivity delay', () => {
  const h = harness();
  h.controls.setPlaying(true);
  h.tick(2000);
  h.pointer('pointermove');
  h.tick(1000);
  assert.equal(h.idle(), false);
  h.tick(1500);
  assert.equal(h.idle(), true);
  h.pointer('pointermove', 'pen');
  assert.equal(h.idle(), false);
  h.tick(2500);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('pause and stop immediately reveal the button and remove pending inactivity work', () => {
  const h = harness();
  h.controls.setPlaying(true);
  h.tick(2500);
  h.controls.setPlaying(false);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.setPlaying(true);
  h.tick(1000);
  h.controls.setPlaying(false);
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});

test('keyboard focus reveals a faded button and protects it until focus leaves', () => {
  const h = harness();
  h.controls.setPlaying(true);
  h.tick(2500);
  h.window.dispatchEvent(new Event('keydown'));
  assert.equal(h.idle(), false);
  h.focus(true);
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.pointer('pointermove');
  h.tick(10000);
  assert.equal(h.idle(), false);
  h.blur();
  h.tick(2499);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('mouse-click focus permits fading and a touch or pointer press reveals the control', () => {
  const h = harness();
  h.controls.setPlaying(true);
  h.pointer('pointerdown');
  h.focus(false);
  h.tick(2500);
  assert.equal(h.idle(), true);
  h.pointer('pointerdown', 'touch');
  assert.equal(h.idle(), false);
  h.tick(2500);
  assert.equal(h.idle(), true);
  h.window.dispatchEvent(new Event('keydown'));
  assert.equal(h.idle(), false);
  h.controls.destroy();
});

test('touch devices keep the playback button visible and switching input capabilities updates fading', () => {
  const h = harness({ finePointer: false });
  h.controls.setPlaying(true);
  h.pointer('pointermove', 'touch');
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.device(true);
  h.tick(2500);
  assert.equal(h.idle(), true);
  h.device(false);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});

test('repeated playing notifications do not postpone fading or reveal an idle button', () => {
  const h = harness();
  h.controls.setPlaying(true);
  h.tick(2000);
  h.controls.setPlaying(true);
  h.tick(500);
  assert.equal(h.idle(), true);
  h.controls.setPlaying(true);
  assert.equal(h.idle(), true);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});

test('a hidden page clears the timer and starts a fresh delay when it becomes visible', () => {
  const h = harness();
  h.controls.setPlaying(true);
  h.tick(1000);
  h.visibility(true);
  assert.equal(h.timers.size, 0);
  h.pointer('pointermove');
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.visibility(false);
  h.tick(2499);
  assert.equal(h.idle(), false);
  h.tick(1);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('playback that starts in a background page waits for visibility before fading', () => {
  const h = harness({ hidden: true });
  h.controls.setPlaying(true);
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.visibility(false);
  h.tick(2500);
  assert.equal(h.idle(), true);
  h.controls.destroy();
});

test('destroy removes all event listeners and timers, reveals the button, and prevents further changes', () => {
  const h = harness();
  h.controls.setPlaying(true);
  h.tick(2500);
  assert.equal(h.idle(), true);
  h.controls.destroy();
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  for (const surface of [h.window, h.document, h.button, h.cursor]) assert.equal(surface.listenerCount(), 0);
  h.controls.setPlaying(false);
  h.controls.setPlaying(true);
  h.pointer('pointermove');
  h.visibility(false);
  h.focus(false);
  h.tick(10000);
  assert.equal(h.idle(), false);
  assert.equal(h.timers.size, 0);
  h.controls.destroy();
});
