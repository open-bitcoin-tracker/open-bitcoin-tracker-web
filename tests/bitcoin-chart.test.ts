import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartPaths, chartPositions, chartViewport, compactPositions, nearestHistoryIndex } from '../src/lib/bitcoin-chart.ts';

test('dense paths preserve each column’s extrema, timestamps and both endpoints', () => {
  const positions = Array.from({ length: 1000 }, (_, i) => ({ x: i / 100, y: Math.sin(i) * 100 }));
  const compact = compactPositions(positions);
  assert.equal(compact[0], positions[0]);
  assert.equal(compact.at(-1), positions.at(-1));
  assert.ok(compact.length <= 22);
  assert.ok(compact.every((point, i) => i === 0 || point.x > compact[i - 1].x));
  for (let column = 0; column < 10; column++) {
    const original = positions.filter(point => Math.floor(point.x) === column);
    const painted = compact.filter(point => Math.floor(point.x) === column);
    assert.equal(Math.min(...painted.map(point => point.y)), Math.min(...original.map(point => point.y)));
    assert.equal(Math.max(...painted.map(point => point.y)), Math.max(...original.map(point => point.y)));
  }
});

test('path compaction keeps every real sample available for inspection in both scales', () => {
  const points = Array.from({ length: 6000 }, (_, time) => ({ time, price: 100 + 10 * Math.sin(time) }));
  for (const scale of ['linear', 'logarithmic'] as const) {
    const paths = chartPaths(points, 300, 200, scale);
    assert.ok(paths.line.split(' L').length <= 604);
    assert.deepEqual(paths.positions, chartPositions(points, 300, 200, scale));
    assert.equal(paths.positions.length, points.length);
    assert.equal(nearestHistoryIndex(points, 3210), 3210);
    assert.equal(paths.positions[3210].x, 3210 / 5999 * 300);
  }
});

test('sparse paths retain their original coordinates and area closure', () => {
  const points = [{ time: 0, price: 1 }, { time: 5, price: 10 }, { time: 10, price: 100 }];
  const result = chartPaths(points, 100, 100);
  const coords = result.positions.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`);
  assert.equal(result.line, `M${coords.join(' L')}`);
  assert.equal(result.area, `${result.line} L100.00,100 L0.00,100 Z`);
  assert.deepEqual(chartPaths([], 100, 100), { line: '', area: '', positions: [] });
});

test('viewport calculations accept large histories without argument-spread limits', () => {
  const points = Array.from({ length: 200_000 }, (_, time) => ({ time, price: time + 1 }));
  const viewport = chartViewport(points, 'linear');
  assert.equal(viewport.start, 0);
  assert.equal(viewport.end, 199_999);
  assert.equal(viewport.bottom, 1 - 199_999 * 0.05);
  assert.equal(viewport.top, 1 + 199_999 * 1.05);
});
