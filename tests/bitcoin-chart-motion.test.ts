import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartPaths, chartViewport, visibleHistory } from '../src/lib/bitcoin-chart.ts';
import { ChartMotion, type ChartScene } from '../src/lib/bitcoin-chart-motion.ts';

const points = [10, 20, 40, 100, 80].map((price, time) => ({ time: time * 1000, price }));
function scene(rangeKey = 'all', subset = points, scale: ChartScene['scale'] = 'logarithmic'): ChartScene {
  return { rangeKey, points, scale, viewport: chartViewport(subset, scale) };
}

test('range changes zoom the camera and retain the wider outgoing curve', () => {
  const motion = new ChartMotion();
  motion.update(scene(), 0);
  const target = { ...scene('day', points.slice(3)), points: points.slice(3) };
  motion.update(target, 10);
  const halfway = motion.sample(235)!;
  assert.ok(halfway.viewport.start > 0 && halfway.viewport.start < 3000);
  assert.equal(halfway.points, points);
  assert.equal(motion.animating, true);
  assert.deepEqual(motion.sample(460), target);
  assert.equal(motion.animating, false);
});

test('rapid range changes start from the displayed viewport and expand using the incoming curve', () => {
  const motion = new ChartMotion();
  motion.update(scene(), 0);
  motion.update(scene('day', points.slice(3)), 10);
  const interrupted = motion.sample(160)!.viewport;
  motion.update(scene('month', points.slice(1)), 160);
  assert.deepEqual(motion.sample(160)!.viewport, interrupted);
  assert.equal(motion.sample(160)!.points, points);
  assert.deepEqual(motion.sample(610), scene('month', points.slice(1)));
});

test('scale fades switch geometry only when invisible, then restore full opacity', () => {
  const motion = new ChartMotion();
  motion.update(scene(), 0);
  motion.update(scene('all', points, 'linear'), 10);
  assert.equal(motion.sample(85)!.scale, 'logarithmic');
  assert.ok(Math.abs(motion.opacity - .5) < .001);
  assert.equal(motion.sample(160)!.scale, 'linear');
  assert.equal(motion.opacity, 0);
  motion.sample(235);
  assert.ok(Math.abs(motion.opacity - .5) < .001);
  motion.sample(310);
  assert.equal(motion.opacity, 1);
  assert.equal(motion.animating, false);
});

test('rapid scale toggles and range changes during a fade settle on the latest choice', () => {
  const motion = new ChartMotion();
  motion.update(scene(), 0);
  motion.update(scene('all', points, 'linear'), 10);
  motion.sample(85);
  const opacity = motion.opacity;
  motion.update(scene('day', points.slice(3)), 85);
  assert.equal(motion.opacity, opacity);
  assert.equal(motion.sample(500)!.scale, 'logarithmic');
  assert.deepEqual(motion.sample(500)!.viewport, scene('day', points.slice(3)).viewport);
  assert.equal(motion.opacity, 1);
});

test('live updates do not start or restart zooms; immediate updates cancel all motion', () => {
  const motion = new ChartMotion();
  motion.update(scene(), 0);
  motion.update(scene(), 10);
  assert.equal(motion.animating, false);
  motion.update(scene('day', points.slice(3)), 20);
  motion.update(scene('day', points.slice(3)), 200);
  motion.sample(470);
  assert.equal(motion.animating, false);
  motion.update(scene('all', points, 'linear'), 500);
  motion.update(scene(), 510, true);
  assert.equal(motion.animating, false);
  assert.equal(motion.opacity, 1);
  assert.deepEqual(motion.sample(510), scene());
});

test('camera projection preserves sample timestamps and clips with boundary neighbours', () => {
  const viewport = chartViewport(points.slice(2), 'linear');
  const visible = visibleHistory(points, viewport);
  assert.deepEqual(visible, points.slice(1));
  const paths = chartPaths(visible, 400, 200, 'linear', viewport);
  assert.equal(paths.positions[1].x, 0);
  assert.equal(paths.positions.at(-1)!.x, 400);
  assert.ok(paths.positions[0].x < 0);
  assert.ok(paths.positions.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
  assert.ok(paths.area.endsWith(' L400.00,200 L-200.00,200 Z'));
});

test('flat histories stay finite and clearing cancels a transition', () => {
  const flat = points.map((point) => ({ ...point, price: 10 }));
  for (const scale of ['linear', 'logarithmic'] as const) {
    assert.ok(chartPaths(flat, 400, 200, scale).positions.every(({ y }) => Number.isFinite(y)));
  }
  const motion = new ChartMotion();
  motion.update(scene(), 0);
  motion.update(scene('day', points.slice(3)), 10);
  motion.clear();
  assert.equal(motion.sample(20), undefined);
  assert.equal(motion.animating, false);
});
