import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { SupplySnapshot } from '../src/features/supply/model.ts';
import { ASSET_IDS, baseValues, layoutAssets, broadMoneyUsd, capFromPosition, circulatingSupply, estimateHeight, goldOunces, isValidWealthSnapshot, positionFromCap, priceMilestones, redistribute, snapCap, SLIDER_STEPS, squarify, totalValue, type AssetValues, type WealthSnapshot } from '../src/features/wealth/model.ts';

const read = <T>(path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
const snapshot = read<WealthSnapshot>('../src/features/wealth/snapshot.json');
const supply = read<SupplySnapshot>('../src/features/supply/snapshot.json');
const base: AssetValues = { realEstate: 400, bonds: 160, equities: 160, fiat: 100, gold: 25, silver: 3, bitcoin: 5 };
const close = (actual: number, expected: number, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon * Math.max(1, Math.abs(expected)), `${actual} ≠ ${expected}`);

test('bundled wealth snapshot is valid and converts all five broad money aggregates', () => {
  assert.ok(isValidWealthSnapshot(snapshot));
  const fiat = broadMoneyUsd(supply, snapshot.fiat.usdRates);
  assert.ok(fiat > 50e12 && fiat < 300e12);
  assert.ok(Number.isNaN(broadMoneyUsd(supply, { ...snapshot.fiat.usdRates, CNY: 0 })));
  assert.equal(isValidWealthSnapshot({ ...snapshot, assets: snapshot.assets.slice(1) }), false);
  assert.equal(isValidWealthSnapshot({ ...snapshot, gold: { ...snapshot.gold, tonnes: -1 } }), false);
  assert.equal(isValidWealthSnapshot({ ...snapshot, silver: { ...snapshot.silver, ounces: 0 } }), false);
});

test('circulating supply follows the halving schedule and never exceeds 21 million', () => {
  assert.equal(circulatingSupply(0), 50);
  assert.equal(circulatingSupply(209_999), 10_500_000);
  assert.equal(circulatingSupply(210_000), 10_500_025);
  assert.equal(circulatingSupply(840_000), 19_687_503.125);
  assert.ok(circulatingSupply(10_000_000) < 21_000_000);
  assert.ok(Number.isNaN(circulatingSupply(-1)));
});

test('height estimates add ten-minute blocks after the reference and never go backwards', () => {
  const reference = Date.parse(snapshot.bitcoin.referenceTime);
  assert.equal(estimateHeight(snapshot.bitcoin, reference - 86_400_000), snapshot.bitcoin.referenceHeight);
  assert.equal(estimateHeight(snapshot.bitcoin, reference + 86_400_000), snapshot.bitcoin.referenceHeight + 144);
  assert.equal(estimateHeight(snapshot.bitcoin, NaN), snapshot.bitcoin.referenceHeight);
});

test('base values price gold and silver per troy ounce and Bitcoin per circulating coin', () => {
  close(goldOunces(1), 32_150.746568627982);
  const values = baseValues(snapshot, 1e14, 100_000, 4_000, 40, 20_000_000);
  assert.equal(values.silver, snapshot.silver.ounces * 40);
  assert.equal(values.bitcoin, 2e12);
  close(values.gold, goldOunces(snapshot.gold.tonnes) * 4_000);
  assert.equal(values.fiat, 1e14);
  assert.equal(values.realEstate, snapshot.assets.find(({ id }) => id === 'realEstate')!.valueUsd);
});

test('redistribution keeps the total fixed and moves value proportionally', () => {
  const total = totalValue(base);
  const grown = redistribute(base, 105);
  assert.equal(grown.bitcoin, 105);
  close(totalValue(grown), total);
  close(grown.realEstate / grown.gold, base.realEstate / base.gold);
  close(grown.gold, 25 * (853 - 105) / 848);
  close(totalValue(redistribute(base, 1)), total);
  assert.ok(redistribute(base, 1).gold > base.gold);
  const all = redistribute(base, total * 2);
  assert.equal(all.bitcoin, total);
  for (const id of ASSET_IDS) if (id !== 'bitcoin') assert.equal(all[id], 0);
  assert.equal(redistribute(base, -10).bitcoin, 0);
});

test('the logarithmic slider starts at today\'s market cap, round-trips and clamps', () => {
  const min = 1.2e12, max = 850e12;
  assert.equal(capFromPosition(0, min, max), min);
  close(capFromPosition(SLIDER_STEPS, min, max), max);
  close(capFromPosition(positionFromCap(5e12, min, max), min, max), 5e12);
  assert.equal(positionFromCap(1e11, min, max), 0);
  assert.equal(positionFromCap(max * 2, min, max), SLIDER_STEPS);
  assert.equal(capFromPosition(-5, min, max), min);
});

test('price milestones are round prices strictly inside the slider range', () => {
  assert.deepEqual(priceMilestones(60_116, 1_000_000), [70_000, 80_000, 90_000, 100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 700_000, 800_000, 900_000]);
  assert.deepEqual(priceMilestones(5, 5), []);
  assert.deepEqual(priceMilestones(0, 100), []);
});

test('the slider snaps onto a nearby round price and leaves other positions alone', () => {
  const supply = 20e6, min = 60_000 * supply, max = 40e6 * supply;
  const at200k = positionFromCap(200_000 * supply, min, max);
  assert.deepEqual(snapCap(at200k + 3, min, max, supply, 5), { cap: 200_000 * supply, milestone: 200_000 });
  const free = snapCap(at200k + 20, min, max, supply, 5);
  assert.equal(free.milestone, undefined);
  close(free.cap, capFromPosition(at200k + 20, min, max));
  // $40M lies a few steps from the end of a $42M range; the end still wins there.
  const nearMax = 42e6 * supply;
  assert.deepEqual(snapCap(SLIDER_STEPS, min, nearMax, supply, 5), { cap: nearMax });
  assert.deepEqual(snapCap(SLIDER_STEPS - 1, min, nearMax, supply, 5), { cap: nearMax });
  assert.deepEqual(snapCap(0.5, min, max, supply, 5), { cap: min });
});

test('squarified treemap fills the area exactly, proportionally and without overlap', () => {
  const items = ASSET_IDS.map((id) => ({ id, value: base[id] }));
  const rects = squarify(items, 160, 90);
  const total = totalValue(base);
  let area = 0;
  for (const { id, value } of items) {
    const rect = rects[id];
    close(rect.w * rect.h, value / total * 160 * 90, 1e-9);
    assert.ok(rect.x >= -1e-9 && rect.y >= -1e-9 && rect.x + rect.w <= 160 + 1e-9 && rect.y + rect.h <= 90 + 1e-9);
    area += rect.w * rect.h;
  }
  close(area, 160 * 90);
  for (const a of items) for (const b of items) {
    if (a.id >= b.id) continue;
    const r = rects[a.id], s = rects[b.id];
    const overlap = Math.max(0, Math.min(r.x + r.w, s.x + s.w) - Math.max(r.x, s.x)) * Math.max(0, Math.min(r.y + r.h, s.y + s.h) - Math.max(r.y, s.y));
    assert.ok(overlap < 1e-6, `${a.id} overlaps ${b.id}`);
  }
  const empty = squarify([{ id: 'a', value: 0 }, { id: 'b', value: 1 }], 10, 10);
  assert.deepEqual(empty.a, { x: 0, y: 0, w: 0, h: 0 });
  close(empty.b.w * empty.b.h, 100);
});

test('the pinned item starts in the top-left corner at any size', () => {
  for (const bitcoin of [0.5, 5, 300, 2000]) {
    const values = redistribute(base, bitcoin);
    const rects = squarify(ASSET_IDS.map((id) => ({ id, value: values[id] })), 160, 90, 'bitcoin');
    assert.equal(rects.bitcoin.x, 0);
    assert.equal(rects.bitcoin.y, 0);
    close(rects.bitcoin.w * rects.bitcoin.h, values.bitcoin / totalValue(values) * 160 * 90);
  }
});

test('silver nests in a corner of gold, which wraps around it', () => {
  const inside = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;
  for (const bitcoin of [0.5, 5, 25, 100, 150, 300, 800]) {
    const values = redistribute(base, bitcoin);
    const { rects, notches, corners } = layoutAssets(values, 160, 90);
    const silver = rects.silver;
    close(silver.w * silver.h, values.silver / totalValue(values) * 160 * 90, 1e-6);
    assert.ok(inside(silver, rects.gold) || (close(silver.x, rects.gold.x), silver.y >= rects.gold.y + rects.gold.h - 1e-6), `silver inside gold at ${bitcoin}`);
    const cut = notches.gold && notches.gold.w === silver.w && silver.x === rects.gold.x && silver.y === rects.gold.y ? notches.gold : corners.gold;
    if (cut) close(silver.w, silver.h);
  }
  const plain = layoutAssets(base, 160, 90);
  assert.deepEqual([plain.rects.silver.x, plain.rects.silver.y], [plain.rects.gold.x, plain.rects.gold.y]);
  assert.deepEqual(plain.notches.gold, { w: plain.rects.silver.w, h: plain.rects.silver.h });
});

test('Bitcoin stays square in the corner beside fiat and gold, with exact areas around it', () => {
  const touches = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => {
    const e = 1e-6;
    const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return (xOverlap >= -e && yOverlap > e) || (yOverlap >= -e && xOverlap > e);
  };
  for (const bitcoin of [0.5, 5, 25, 100, 150, 300]) {
    const values = redistribute(base, bitcoin);
    const total = totalValue(values);
    const { rects, notches, corners } = layoutAssets(values, 160, 90);
    assert.deepEqual([rects.bitcoin.x, rects.bitcoin.y], [0, 0]);
    close(rects.bitcoin.w, rects.bitcoin.h);
    close(rects.bitcoin.w * rects.bitcoin.h, values.bitcoin / total * 160 * 90, 1e-6);
    assert.ok(notches.fiat, `fiat wraps Bitcoin at ${bitcoin}`);
    for (const id of ASSET_IDS) {
      if (id === 'bitcoin') continue;
      const notch = notches[id];
      const corner = corners[id];
      close(rects[id].w * rects[id].h - (notch ? notch.w * notch.h : 0) - (corner ? corner.w * corner.h : 0), values[id] / total * 160 * 90, 1e-6);
    }
    assert.ok(touches(rects.fiat, rects.gold));
  }
  const dominant = layoutAssets(redistribute(base, 800), 160, 90);
  assert.deepEqual(dominant.notches, {});
  assert.deepEqual([dominant.rects.bitcoin.x, dominant.rects.bitcoin.y], [0, 0]);
  close(dominant.rects.bitcoin.w * dominant.rects.bitcoin.h, 800 / 853 * 160 * 90, 1e-6);
});

