import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/landing-particles.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(options: { reduced?: boolean; hidden?: boolean; context?: boolean } = {}) {
  const media = Object.assign(new EventTarget(), { matches: options.reduced ?? false });
  const document = Object.assign(new EventTarget(), { hidden: options.hidden ?? false,
    createElement: () => ({ width: 0, height: 0, getContext: () => ({
      createRadialGradient() { return { addColorStop() {} }; }, fillRect() {},
    }) }),
  });
  const window = Object.assign(new EventTarget(), { matchMedia: () => media, devicePixelRatio: 3 });
  const bounds = { width: 1_000, height: 700, left: 0, top: 0 };
  let circles: number[][] = [];
  let draws = 0;
  const transforms: number[][] = [];
  const context = {
    clearRect() { draws++; circles = []; },
    drawImage(_sprite: unknown, x: number, y: number, width: number) { circles.push([x + width / 2, y + width / 2, width / 2]); },
    setTransform(...values: number[]) { transforms.push(values); },
  };
  const canvas = { width: 0, height: 0, getBoundingClientRect: () => bounds,
    getContext: () => options.context === false ? null : context };
  const frames = new Map<number, (now: number) => void>();
  let nextId = 1;
  let resize = () => {};
  let disconnected = false;
  class Observer {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  let seed = 37;
  const math = Object.create(Math);
  math.random = () => ((seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647);
  const exports: { createLandingParticles?: (canvas: unknown) => { destroy(): void } } = {};
  runInNewContext(script, { exports, document, window, ResizeObserver: Observer, Math: math,
    requestAnimationFrame(callback: (now: number) => void) { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
  });
  const effect = exports.createLandingParticles!(canvas);
  function advance(now: number) {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(now));
  }
  function pointer(x: number, y: number, pointerType = 'mouse') {
    window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: x, clientY: y, pointerType }));
  }
  return {
    effect, canvas, bounds, transforms, frames, window, pointer, advance,
    resize: () => resize(), circles: () => circles.map(point => [...point]),
    draws: () => draws, disconnected: () => disconnected,
    reduced(matches: boolean) { media.matches = matches; media.dispatchEvent(new Event('change')); },
    visibility(hidden: boolean) { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('particles drift slowly without mouse input and render sharply with capped pixel density', () => {
  const h = harness();
  const initial = h.circles();
  assert.equal(initial.length, 2 * 1_077, 'desktop density is exactly twice the previous field');
  assert.equal(h.canvas.width, 2_000);
  assert.equal(h.canvas.height, 1_400);
  assert.deepEqual(h.transforms[0], [2, 0, 0, 2, 0, 0]);
  h.advance(0);
  for (let now = 40; now <= 1_000; now += 40) h.advance(now);
  const index = initial.findIndex(point => point[1] > 40 && point[1] < 660);
  const distance = Math.hypot(initial[index][0] - h.circles()[index][0], initial[index][1] - h.circles()[index][1]);
  assert.ok(distance > 1 && distance < 12, 'drift stays at a few pixels per second');
  assert.equal(h.frames.size, 1);
  h.effect.destroy();
});

test('nearby particles follow a shared slow current while broad waves move in different directions', () => {
  const h = harness();
  const initial = h.circles();
  const inside = (point: number[]) => point[0] > 80 && point[0] < 920 && point[1] > 80 && point[1] < 620;
  let pair: [number, number] | undefined;
  for (let i = 0; i < initial.length && !pair; i++) {
    if (!inside(initial[i])) continue;
    const nearby = initial.findIndex((point, j) => j !== i && inside(point)
      && Math.hypot(point[0] - initial[i][0], point[1] - initial[i][1]) < 10);
    if (nearby !== -1) pair = [i, nearby];
  }
  assert.ok(pair, 'the dense field has neighboring particles');
  h.advance(0);
  for (let now = 40; now <= 1_000; now += 40) h.advance(now);
  const moved = h.circles();
  const displacement = (index: number) => [moved[index][0] - initial[index][0], moved[index][1] - initial[index][1]];
  const first = displacement(pair[0]);
  const second = displacement(pair[1]);
  assert.ok(Math.hypot(first[0] - second[0], first[1] - second[1]) < 2.5, 'neighbors flow together');
  const vertical = initial.flatMap((point, index) => inside(point) ? [displacement(index)[1]] : []);
  assert.ok(vertical.some(value => value > 1) && vertical.some(value => value < -1), 'wide swells rise and fall across the field');
  assert.ok(vertical.every(value => Math.abs(value) < 10), 'wave motion remains slow');
  h.effect.destroy();
});

test('cursor response stays local, gentle, and eases back when the cursor leaves', () => {
  const active = harness();
  const baseline = harness();
  const points = active.circles();
  const near = points.findIndex(point => point[0] > 100 && point[0] < 900 && point[1] > 100 && point[1] < 600);
  const [x, y] = points[near];
  const far = points.findIndex(point => Math.hypot(point[0] - x, point[1] - y) > 400);
  active.pointer(x + 30, y);
  active.advance(0); baseline.advance(0);
  for (let now = 40; now <= 1_000; now += 40) { active.advance(now); baseline.advance(now); }
  const displaced = baseline.circles()[near][0] - active.circles()[near][0];
  assert.ok(displaced > 5 && displaced < 28, 'nearby particles gently move away');
  assert.deepEqual(active.circles()[far], baseline.circles()[far], 'distant particles continue drifting normally');
  active.window.dispatchEvent(Object.assign(new Event('pointerout'), { relatedTarget: null }));
  active.advance(1_040); baseline.advance(1_040);
  const returning = baseline.circles()[near][0] - active.circles()[near][0];
  assert.ok(returning > 0 && returning < displaced, 'release eases rather than snapping');
  for (let now = 1_080; now <= 6_000; now += 40) { active.advance(now); baseline.advance(now); }
  assert.ok(Math.abs(baseline.circles()[near][0] - active.circles()[near][0]) < .01);
  active.effect.destroy(); baseline.effect.destroy();
});

test('reduced motion renders a still field and reacts to preference changes immediately', () => {
  const h = harness({ reduced: true });
  const still = h.circles();
  assert.ok(still.length > 0);
  assert.equal(h.frames.size, 0);
  h.pointer(400, 300);
  h.advance(2_000);
  assert.deepEqual(h.circles(), still);
  h.reduced(false);
  assert.equal(h.frames.size, 1);
  h.advance(2_000); h.advance(2_040);
  assert.notDeepEqual(h.circles(), still);
  h.reduced(true);
  assert.equal(h.frames.size, 0);
  h.effect.destroy();
});

test('hidden pages and page-cache navigation pause rendering and resume without a time jump', () => {
  const h = harness();
  h.advance(0); h.advance(40);
  h.visibility(true);
  const draws = h.draws();
  h.advance(60_000);
  assert.equal(h.frames.size, 0);
  assert.equal(h.draws(), draws);
  h.visibility(false);
  const before = h.circles();
  h.advance(60_000);
  assert.deepEqual(h.circles(), before);
  h.window.dispatchEvent(new Event('pagehide'));
  assert.equal(h.frames.size, 0);
  h.window.dispatchEvent(new Event('pageshow'));
  assert.equal(h.frames.size, 1);
  h.effect.destroy();
  h.visibility(false);
  h.reduced(false);
  h.window.dispatchEvent(new Event('pageshow'));
  assert.equal(h.frames.size, 0);
  assert.equal(h.disconnected(), true);
});

test('touch does not disturb the background; resizing keeps the particle count bounded', () => {
  const h = harness();
  const baseline = harness();
  h.pointer(400, 300, 'touch');
  h.advance(0); baseline.advance(0);
  h.advance(40); baseline.advance(40);
  assert.deepEqual(h.circles(), baseline.circles());
  h.bounds.width = 390; h.bounds.height = 844;
  h.resize();
  assert.equal(h.canvas.width, 780);
  assert.equal(h.circles().length, 2 * 506, 'mobile density also doubles');
  h.bounds.width = 320; h.bounds.height = 480;
  h.resize();
  assert.equal(h.circles().length, 640, 'the minimum density doubles');
  h.bounds.width = 8_000; h.bounds.height = 4_000;
  h.resize();
  assert.equal(h.circles().length, 4_400, 'the maximum particle budget doubles');
  h.effect.destroy(); baseline.effect.destroy();
  harness({ context: false }).effect.destroy();
});
