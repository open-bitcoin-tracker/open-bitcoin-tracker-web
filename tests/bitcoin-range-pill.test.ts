import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createRangePill } from '../src/scripts/bitcoin-range-pill.ts';

// Exercise gesture coordination with deterministic geometry; actual layout and
// pointer capture are also checked in the browser.
function fixture(t: TestContext, reduced = false) {
  const animations: { frames: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean }[] = [];
  function animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = { frames, options, cancelled: false };
    animations.push(animation);
    return { cancel() { animation.cancelled = true; } };
  }
  const units = ['day', 'week', 'month', 'year', 'all'] as const;
  const rect = (left: number, width = 100) => ({ left, right: left + width, top: 0, bottom: 36, width, height: 36 });
  const pill = { animate, hidden: true, style: { transform: '', width: '', height: '', transition: '' }, getBoundingClientRect() {
    return rect(Number(this.style.transform.match(/\(([^p]+)/)?.[1] ?? 400));
  } };
  const slots = units.map((unit, index) => ({
    dataset: { rangeSlot: unit, selected: String(index === 4), highlighted: '' },
    getBoundingClientRect: () => rect(index * 100),
    querySelector: (selector: string) => selector === '[data-range-label]'
      ? { animate, getBoundingClientRect: () => rect(index * 100 + 40, 20) }
      : { animate, focus: () => {} },
  }));
  const bar = Object.assign(new EventTarget(), {
    dataset: {} as Record<string, string>,
    querySelector: () => pill,
    querySelectorAll: () => slots,
    getBoundingClientRect: () => rect(0, 500),
    closest: () => null,
    captured: -1,
    setPointerCapture(id: number) { this.captured = id; },
    hasPointerCapture(id: number) { return this.captured === id; },
    releasePointerCapture() { this.captured = -1; },
  });
  const preference = Object.assign(new EventTarget(), { matches: reduced });
  const windowStub = Object.assign(new EventTarget(), { matchMedia: () => preference });
  let resize = () => {};
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowStub });
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  } });
  const drops: string[] = [];
  const steps: { unit: string; step: number }[] = [];
  const control = createRangePill(bar as unknown as HTMLElement,
    (unit) => { drops.push(unit); control.select(unit); },
    (unit, step) => { steps.push({ unit, step }); control.select(unit); },
  );
  control.select('all');
  t.after(() => {
    control.destroy();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousObserver) Object.defineProperty(globalThis, 'ResizeObserver', previousObserver);
    else Reflect.deleteProperty(globalThis, 'ResizeObserver');
  });
  function event(type: string, x = 450, extra: Record<string, unknown> = {}) {
    const { target, ...properties } = extra;
    const event = Object.assign(new Event(type, { cancelable: true }), {
      pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: 18, ...properties,
    });
    if (target) Object.defineProperty(event, 'target', { value: target });
    bar.dispatchEvent(event);
    return event;
  }
  return { bar, pill, slots, control, drops, steps, animations, event, resize: () => resize(), preference };
}

test('touch capture transfers from the pressed label to the bar without cancelling a vertical swipe', (t) => {
  const f = fixture(t, true);
  f.control.select('day');
  f.event('pointerdown', 50, { pointerType: 'touch' });
  f.event('pointermove', 50, { pointerType: 'touch', clientY: 12 });
  assert.equal(f.bar.captured, 1);
  // Touch implicitly captures the pressed descendant. On the next move,
  // transferring capture to the bar fires this bubbling event on that child.
  f.event('lostpointercapture', 50, { target: f.slots[0].querySelector('[data-range-label]'), pointerType: 'touch' });
  f.event('gotpointercapture', 50, { pointerType: 'touch' });
  f.event('pointermove', 50, { pointerType: 'touch', clientY: -6 });
  f.event('pointermove', 50, { pointerType: 'touch', clientY: 18 });
  f.event('pointerup', 50, { pointerType: 'touch' });
  assert.deepEqual(f.steps, [{ unit: 'day', step: 1 }, { unit: 'day', step: -1 }]);
  assert.equal(f.bar.captured, -1);
});

test('touch capture transfers preserve horizontal dragging while actual bar capture loss still cancels', (t) => {
  const f = fixture(t, true);
  f.event('pointerdown', 450, { pointerType: 'touch' });
  f.event('pointermove', 440, { pointerType: 'touch' });
  f.event('lostpointercapture', 440, { target: f.slots[4].querySelector('[data-range-select]'), pointerType: 'touch' });
  f.event('pointermove', 250, { pointerType: 'touch' });
  f.event('pointerup', 250, { pointerType: 'touch' });
  assert.deepEqual(f.drops, ['month']);
  f.event('pointerdown', 250, { pointerType: 'touch' });
  f.event('pointermove', 150, { pointerType: 'touch' });
  f.event('lostpointercapture', 150, { pointerType: 'touch' });
  f.event('pointerup', 150, { pointerType: 'touch' });
  assert.deepEqual(f.drops, ['month']);
  assert.equal(f.bar.dataset.dragging, undefined);
});

test('vertical swipes step every 24 px, reverse direction, and survive tracker updates', (t) => {
  const f = fixture(t);
  f.control.select('day');
  f.event('pointerdown', 50);
  f.event('pointermove', 51, { clientY: -5 });
  assert.deepEqual(f.steps, []);
  f.event('pointermove', 51, { clientY: -6 });
  assert.deepEqual(f.steps, [{ unit: 'day', step: 1 }]);
  assert.equal(f.slots[0].dataset.highlighted, 'true', 'a swipe during a tap glide highlights the current slot');
  assert.equal(f.bar.captured, 1);
  f.event('pointermove', 51, { clientY: 18 });
  f.event('pointermove', 51, { clientY: 42 });
  assert.deepEqual(f.steps, [{ unit: 'day', step: 1 }, { unit: 'day', step: -1 }, { unit: 'day', step: -1 }]);
  assert.deepEqual(f.drops, []);
  f.event('pointerup', 51, { clientY: 42 });
  assert.equal(f.bar.captured, -1);
  assert.equal(f.event('click', 51, { detail: 1 }).defaultPrevented, true);
  assert.equal(f.animations[0].options.duration, 220);
  assert.equal(f.animations[0].frames[1].translate, '0 -6px');
  assert.equal(f.animations[0].cancelled, true, 'another step replaces the previous nudge');
});

test('vertical swipes lock the axis and stop permanently outside the app’s 16 px allowance', (t) => {
  const f = fixture(t, true);
  f.control.select('day');
  f.event('pointerdown', 50);
  f.event('pointermove', 50, { clientY: -6 });
  f.event('pointermove', 150, { clientY: 18 });
  f.event('pointermove', 50, { clientY: 42 });
  f.event('pointerup', 50, { clientY: 42 });
  assert.deepEqual(f.steps, [{ unit: 'day', step: 1 }]);
  assert.deepEqual(f.drops, []);
  assert.deepEqual(f.animations, [], 'reduced motion skips the nudge and label roll');
});

test('taps, short vertical drags, cancellation, and non-selected slots do not step', (t) => {
  const f = fixture(t, true);
  f.control.select('day');
  f.event('pointerdown', 50);
  f.event('pointerup', 50);
  f.event('pointerdown', 50);
  f.event('pointermove', 50, { clientY: 30 });
  f.event('pointercancel', 50);
  f.event('pointerdown', 150);
  f.event('pointermove', 150, { clientY: -6 });
  f.event('pointerup', 150);
  assert.deepEqual(f.steps, []);
});

test('horizontal drags ignore vertical movement after choosing their axis', (t) => {
  const f = fixture(t, true);
  f.control.select('day');
  f.event('pointerdown', 50);
  f.event('pointermove', 150);
  f.event('pointermove', 250, { clientY: -6 });
  f.event('pointerup', 250, { clientY: -6 });
  assert.deepEqual(f.steps, []);
  assert.deepEqual(f.drops, ['month']);
});

test('drag previews label crossings, retains the highlight in gaps, and commits only on release', (t) => {
  const f = fixture(t);
  f.event('pointerdown');
  f.event('pointermove', 350);
  assert.equal(f.bar.dataset.dragging, 'true');
  assert.equal(f.slots[3].dataset.highlighted, 'true');
  assert.deepEqual(f.drops, []);
  f.event('pointermove', 300);
  assert.equal(f.slots[3].dataset.highlighted, 'true');
  f.event('pointerup', 300);
  assert.deepEqual(f.drops, ['year']);
  assert.equal(f.pill.style.transform, 'translate3d(300px, 0px, 0)');
  assert.equal(f.bar.captured, -1);
  assert.equal(f.event('click', 300, { detail: 1 }).defaultPrevented, true);
  assert.equal(f.event('click', 300, { detail: 0 }).defaultPrevented, false);
});

test('clamping keeps the pill on the track and allows immediate movement back from an edge', (t) => {
  const f = fixture(t);
  f.event('pointerdown');
  f.event('pointermove', -200);
  assert.equal(f.pill.style.transform, 'translate3d(0px, 0px, 0)');
  f.event('pointermove', -100);
  assert.equal(f.pill.style.transform, 'translate3d(100px, 0px, 0)');
  f.event('pointermove', 900);
  assert.equal(f.pill.style.transform, 'translate3d(400px, 0px, 0)');
  f.event('pointerup', 900);
  assert.deepEqual(f.drops, []);
});

test('cancel, capture loss, Escape, and layout changes restore selection without a drop', (t) => {
  const f = fixture(t);
  for (const cancel of ['pointercancel', 'lostpointercapture', 'keydown', 'resize']) {
    f.event('pointerdown');
    f.event('pointermove', 250);
    if (cancel === 'resize') f.resize();
    else f.event(cancel, 250, { key: 'Escape' });
    assert.deepEqual(f.drops, []);
    assert.equal(f.slots[4].dataset.highlighted, 'true');
    assert.equal(f.pill.style.transform, 'translate3d(400px, 0px, 0)');
    assert.equal(f.bar.dataset.dragging, undefined);
  }
});

test('vertical scrolling, plain taps, and secondary pointers do not start a drag', (t) => {
  const f = fixture(t);
  f.event('pointerdown');
  f.event('pointerup');
  assert.equal(f.event('click', 450, { detail: 1 }).defaultPrevented, false);
  f.event('pointerdown');
  f.event('pointermove', 451, { clientY: 40 });
  f.event('pointermove', 250);
  f.event('pointerup', 250);
  f.event('pointerdown', 450, { isPrimary: false });
  f.event('pointermove', 250);
  assert.equal(f.bar.dataset.dragging, undefined);
  assert.deepEqual(f.drops, []);
});

test('rapid taps highlight only the latest target after the app’s 90 ms lead', async (t) => {
  const f = fixture(t);
  f.control.select('day');
  f.control.select('month');
  assert.equal(f.slots[4].dataset.highlighted, 'true');
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(f.slots[2].dataset.highlighted, 'true');
  assert.equal(f.slots[0].dataset.highlighted, 'false');
});

test('pill movement ends only when a position transition reaches the selected slot', (t) => {
  const f = fixture(t);
  let left = 400;
  f.pill.getBoundingClientRect = () => ({ left, right: left + 100, top: 0, bottom: 36, width: 100, height: 36 });
  f.control.select('day');
  assert.equal(f.bar.dataset.moving, 'true');
  left = 200;
  f.event('transitionend', 0, { target: f.pill, propertyName: 'transform' });
  assert.equal(f.bar.dataset.moving, 'true', 'an earlier transition cannot reveal the chevrons during a glide');
  left = 0;
  f.event('transitionend', 0, { target: f.pill, propertyName: 'color' });
  assert.equal(f.bar.dataset.moving, 'true');
  f.event('transitionend', 0, { target: f.pill, propertyName: 'transform' });
  assert.equal(f.bar.dataset.moving, undefined);
});

test('rapid selections and drag snapping keep movement pending until the latest target is reached', (t) => {
  const f = fixture(t);
  let left = 400;
  f.pill.getBoundingClientRect = () => ({ left, right: left + 100, top: 0, bottom: 36, width: 100, height: 36 });
  f.control.select('day');
  left = 300;
  f.control.select('month');
  f.control.select('month');
  f.event('transitioncancel', 0, { target: f.pill, propertyName: 'transform' });
  assert.equal(f.bar.dataset.moving, 'true');
  left = 200;
  f.event('transitionend', 0, { target: f.pill, propertyName: 'transform' });
  assert.equal(f.bar.dataset.moving, undefined);
  f.event('pointerdown', 250);
  f.event('pointermove', 160);
  left = 110;
  assert.equal(f.bar.dataset.dragging, 'true');
  f.event('pointerup', 160);
  assert.deepEqual(f.drops, ['week']);
  assert.equal(f.bar.dataset.moving, 'true');
  left = 100;
  f.event('transitionend', 0, { target: f.pill, propertyName: 'transform' });
  assert.equal(f.bar.dataset.moving, undefined);
});

test('reduced motion highlights immediately and preference changes end pending motion', (t) => {
  const f = fixture(t, true);
  f.control.select('day');
  assert.equal(f.slots[0].dataset.highlighted, 'true');
  assert.equal(f.bar.dataset.moving, undefined);
  f.preference.matches = false;
  f.control.select('month');
  assert.equal(f.slots[0].dataset.highlighted, 'true');
  assert.equal(f.bar.dataset.moving, 'true');
  f.preference.matches = true;
  f.preference.dispatchEvent(new Event('change'));
  assert.equal(f.slots[2].dataset.highlighted, 'true');
  assert.equal(f.bar.dataset.moving, undefined);
});
