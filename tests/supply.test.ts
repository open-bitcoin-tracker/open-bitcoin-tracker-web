import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { annualRate, annualMiningRate, BITCOIN_MAX, DAY_MS, equalShare, goldAnchor, goldExpiry, goldShareGrams, isValidGold, isValidMoney, isValidSnapshot, MAX_PROJECTION_DAYS, projectGold, projectMoney, projectPopulation, projectionAnchor, scenarioDate, scenarioMoney, scenarioGold, scenarioPopulation, type SupplySnapshot } from '../src/features/supply/model.ts';
import { importReviewedMoney, parseH6, refreshedSnapshot, scaleSource, type ReviewedMoneyImport } from '../src/features/supply/refresh.ts';

const snapshot = JSON.parse(readFileSync(new URL('../src/features/supply/snapshot.json', import.meta.url), 'utf8')) as SupplySnapshot;
const usd = snapshot.fiat[0];

test('scenario calendar dates span fifteen years and clamp leap-day anniversaries', () => {
  const visit = Date.parse('2026-10-12T16:20:00Z');
  assert.equal(scenarioDate(visit, 1), Date.parse('2027-10-12T16:20:00Z'));
  assert.equal(scenarioDate(visit, 15), Date.parse('2041-10-12T16:20:00Z'));
  for (const offset of [-1, 0, 1.5, 16, NaN]) assert.ok(Number.isNaN(scenarioDate(visit, offset)));
  assert.ok(Number.isNaN(scenarioDate(NaN, 1)));
  const leap = Date.parse('2028-02-29T23:00:00Z');
  assert.equal(scenarioDate(leap, 1), Date.parse('2029-02-28T23:00:00Z'));
  assert.equal(scenarioDate(leap, 4), Date.parse('2032-02-29T23:00:00Z'));
});

test('future population uses verified UN points through 2042 without extending today or substituting endpoints', () => {
  assert.equal(snapshot.population.scenarioPoints.length, 18);
  assert.deepEqual(snapshot.population.scenarioPoints.slice(0, 4), snapshot.population.points);
  assert.equal(snapshot.population.scenarioPoints.at(-2)!.persons, 9_232_281_575);
  assert.equal(snapshot.population.scenarioPoints.at(-1)!.persons, 9_286_110_371);
  const at = Date.parse('2041-10-12T00:00:00Z');
  const fraction = (at - Date.parse('2041-07-01')) / (365 * DAY_MS);
  assert.equal(scenarioPopulation(snapshot, at), 9_232_281_575 + (9_286_110_371 - 9_232_281_575) * fraction);
  assert.equal(projectPopulation(snapshot, at).state, 'snapshot');
  assert.equal(projectPopulation(snapshot, at).date, '2028-07-01');
  assert.equal(scenarioPopulation(snapshot, Date.parse('2042-07-01') + 1), null);
  assert.equal(scenarioPopulation(snapshot, Date.parse('2025-07-01') - 1), null);
  for (let year = 1; year <= 15; year++) {
    // Latest day of the current year also needs the 2042 interpolation endpoint.
    assert.ok(scenarioPopulation(snapshot, scenarioDate(Date.parse('2026-12-31'), year))! > 0);
  }
  const bad = structuredClone(snapshot); bad.population.scenarioPoints[5].date = '2031-07-01';
  assert.equal(isValidSnapshot(bad), false);
  assert.equal(scenarioPopulation(bad, at), null);
});

test('future scenarios continue absolute historical additions for all assets while today stays expired', () => {
  const at = Date.parse('2041-10-12');
  for (const money of snapshot.fiat) {
    const years = (at - Date.parse('2026-09-01')) / (365 * DAY_MS);
    assert.ok(Math.abs(scenarioMoney(money, at)! - (money.latest.amount + (money.latest.amount - money.previousYear.amount) * years)) < 1);
    assert.equal(projectMoney(money, at).state, 'stale');
    assert.equal(scenarioMoney(money, Date.parse(money.releasedAt) - 1), null);
  }
  assert.equal(scenarioGold(snapshot.gold, at), 222_600 + 3_671.6 * (at - Date.parse('2026-07-01')) / (365 * DAY_MS));
  assert.equal(projectGold(snapshot.gold, at).state, 'stale');
  assert.equal(scenarioGold(snapshot.gold, Date.parse(snapshot.gold.stock.releasedAt) - 1), null);
});

test('future models preserve flat and contracting rates and never replace impossible estimates with recorded totals', () => {
  const at = Date.parse('2041-10-12');
  const flat = structuredClone(usd); flat.previousYear.amount = flat.latest.amount;
  assert.equal(scenarioMoney(flat, at), flat.latest.amount);
  const shrinking = structuredClone(usd); shrinking.previousYear.amount = shrinking.latest.amount + 1e11;
  assert.ok(scenarioMoney(shrinking, at)! < shrinking.latest.amount);
  shrinking.previousYear.amount = shrinking.latest.amount * 100;
  assert.equal(scenarioMoney(shrinking, at), null);
  const invalid = structuredClone(usd); invalid.currency = 'EUR';
  assert.equal(scenarioMoney(invalid, at), null);
  const noMining = structuredClone(snapshot.gold); noMining.mineProduction.tonnes = 0;
  assert.equal(scenarioGold(noMining, at), noMining.stock.tonnes);
  noMining.mineProduction.tonnes = -1;
  assert.equal(scenarioGold(noMining, at), null);
  assert.equal(scenarioGold(snapshot.gold, NaN), null);
  assert.equal(scenarioMoney(usd, NaN), null);
});

test('gold adds full mine output in tonnes, excludes recycled market supply and converts shares to grams', () => {
  const gold = snapshot.gold;
  assert.ok(isValidGold(gold));
  assert.equal(gold.stock.tonnes, 222_600);
  assert.equal(goldAnchor(gold), Date.parse('2026-07-01T00:00:00Z'));
  assert.equal(annualMiningRate(gold), 3_671.6 / (365 * 86_400));
  const when = Date.parse('2026-10-11T12:00:00Z');
  const expected = 222_600 + 3_671.6 * (when - goldAnchor(gold)) / (365 * DAY_MS);
  assert.deepEqual(projectGold(gold, when), { tonnes: expected, state: 'projected' });
  assert.equal(goldShareGrams(1, 100), 10_000);
  assert.equal(goldShareGrams(expected, snapshot.population.persons), expected * 1_000_000 / snapshot.population.persons);
  const lessMining = structuredClone(gold); lessMining.mineProduction.tonnes = 3_000;
  assert.ok(projectGold(lessMining, when).tonnes! > lessMining.stock.tonnes);
});

test('gold uses actual calendar-year seconds, including a leap year', () => {
  const leap = structuredClone(snapshot.gold);
  leap.stock.date = '2025-06-30'; leap.stock.releasedAt = '2025-08-18'; leap.checkedAt = '2025-10-11';
  leap.mineProduction.year = 2024; leap.mineProduction.releasedAt = '2025-01-29';
  assert.ok(isValidGold(leap));
  assert.equal(annualMiningRate(leap), leap.mineProduction.tonnes / (366 * 86_400));
});

test('gold respects release time and expires independently of fiat without inventing an unlimited stock', () => {
  const gold = snapshot.gold;
  const release = Date.parse(gold.stock.releasedAt), expiry = goldExpiry(gold);
  assert.equal(expiry, Date.parse('2026-11-16T00:00:00Z'));
  assert.deepEqual(projectGold(gold, release - 1), { tonnes: gold.stock.tonnes, state: 'recorded' });
  assert.equal(projectGold(gold, expiry).state, 'projected');
  assert.deepEqual(projectGold(gold, expiry + 1), { tonnes: gold.stock.tonnes, state: 'stale' });
  assert.equal(projectMoney(usd, expiry + 1).state, 'projected');
});

test('invalid gold observations, units of time or source metadata fail conservatively', () => {
  assert.equal(projectGold(undefined, Date.now()).state, 'unavailable');
  assert.equal(projectGold(snapshot.gold, NaN).state, 'unavailable');
  for (const mutate of [
    (g: typeof snapshot.gold) => { g.stock.tonnes = Infinity; },
    (g: typeof snapshot.gold) => { g.stock.date = '2026-06-31'; },
    (g: typeof snapshot.gold) => { g.mineProduction.tonnes = -1; },
    (g: typeof snapshot.gold) => { g.mineProduction.year = 2026; },
    (g: typeof snapshot.gold) => { g.stock.releasedAt = '2026-06-01'; },
    (g: typeof snapshot.gold) => { g.stock.source = 'https://example.com'; },
  ]) {
    const bad = structuredClone(snapshot); mutate(bad.gold);
    assert.equal(isValidGold(bad.gold), false);
    assert.equal(isValidSnapshot(bad), false);
    assert.equal(projectGold(bad.gold, Date.parse('2026-10-11')).state, 'unavailable');
    assert.equal(projectMoney(bad.fiat[0], Date.parse('2026-10-11')).state, 'projected');
  }
});

test('all five official snapshots retain native units, their own windows and independent rates', () => {
  assert.ok(isValidSnapshot(snapshot));
  assert.deepEqual(snapshot.fiat.map(m => [m.id, m.latest.amount, m.previousYear.amount]), [
    ['usd', 23_342_800_000_000, 22_092_600_000_000],
    ['eur', 16_447_405_000_000, 15_762_736_000_000],
    ['jpy', 1_296_389_500_000_000, 1_271_226_300_000_000],
    ['cny', 356_810_000_000_000, 331_980_000_000_000],
    ['gbp', 3_064_747_000_000, 2_941_749_000_000],
  ]);
  assert.equal(new Set(snapshot.fiat.map(annualRate)).size, 5);
  assert.equal(snapshot.fiat[4].aggregate, 'M4ex');
  assert.equal(equalShare(BITCOIN_MAX, snapshot.population.persons).toFixed(8), '0.00252991');
  assert.equal(equalShare(1, 0), NaN);
});
test('population interpolates official July 1 totals using elapsed time and net change', () => {
  const start = Date.parse('2026-07-01T00:00:00Z');
  const end = Date.parse('2027-07-01T00:00:00Z');
  const first = projectPopulation(snapshot, start);
  const middle = projectPopulation(snapshot, (start + end) / 2);
  const next = projectPopulation(snapshot, start + 1_000);
  assert.equal(first.persons, 8_300_678_395);
  assert.equal(first.state, 'estimated');
  assert.equal(middle.persons, (8_300_678_395 + 8_369_094_344) / 2);
  assert.ok(Math.abs(next.persons! - first.persons! - 68_415_949 / (365 * 86_400)) < .00001);
  assert.equal(projectPopulation(snapshot, end).persons, 8_369_094_344);
});

test('population switches annual intervals at their boundary and includes leap days', () => {
  const start = Date.parse('2027-07-01T00:00:00Z');
  const end = Date.parse('2028-07-01T00:00:00Z');
  assert.equal(end - start, 366 * DAY_MS);
  assert.equal(projectPopulation(snapshot, start).rate, (8_436_618_886 - 8_369_094_344) / (366 * 86_400));
  assert.equal(projectPopulation(snapshot, (start + end) / 2).persons, (8_436_618_886 + 8_369_094_344) / 2);
});

test('population declines when the sourced annual difference is negative', () => {
  const declining = structuredClone(snapshot);
  declining.population.points = [{ date: '2026-07-01', persons: 10_000 }, { date: '2027-07-01', persons: 9_000 }];
  declining.population.persons = 10_000;
  const start = Date.parse('2026-07-01T00:00:00Z');
  const end = Date.parse('2027-07-01T00:00:00Z');
  assert.equal(projectPopulation(declining, (start + end) / 2).persons, 9_500);
  assert.ok(projectPopulation(declining, start).rate < 0);
});

test('population range is bounded and uses the nearest dated annual point outside it', () => {
  const start = Date.parse(snapshot.population.points[0].date);
  const end = Date.parse(snapshot.population.points.at(-1)!.date);
  assert.equal(projectPopulation(snapshot, start).state, 'estimated');
  assert.equal(projectPopulation(snapshot, end).state, 'estimated');
  assert.deepEqual(projectPopulation(snapshot, start - 1), { persons: 8_231_613_070, state: 'snapshot', rate: 0, date: '2025-07-01' });
  assert.deepEqual(projectPopulation(snapshot, end + 1), { persons: 8_436_618_886, state: 'snapshot', rate: 0, date: '2028-07-01' });
  assert.equal(projectPopulation(snapshot, NaN).state, 'unavailable');
});


test('every fiat grows at its own historical rate and respects its publication date', () => {
  assert.ok(Math.abs(annualRate(usd) - 39643.58194) < .00001);
  for (const money of snapshot.fiat) {
    const release = Date.parse(money.releasedAt);
    const a = projectMoney(money, release + DAY_MS);
    const b = projectMoney(money, release + DAY_MS + 1_000);
    assert.equal(a.state, 'projected');
    assert.ok(Math.abs((b.amount! - a.amount!) - annualRate(money)) < 1);
    assert.equal(projectMoney(money, release - 1).state, 'recorded');
  }
});

test('projections expire individually after the bounded horizon and return their recorded stock', () => {
  for (const money of snapshot.fiat) {
    const expires = projectionAnchor(money.latest.month) + MAX_PROJECTION_DAYS * DAY_MS;
    assert.equal(projectMoney(money, expires).state, 'projected');
    assert.deepEqual(projectMoney(money, expires + 1), { amount: money.latest.amount, state: 'stale' });
    assert.equal(projectMoney(money, NaN).state, 'unavailable');
  }
  const later = structuredClone(snapshot.fiat[1]);
  later.latest.month = '2026-09'; later.previousYear.month = '2025-09';
  later.releasedAt = '2026-10-09'; later.checkedAt = '2026-10-11';
  const when = Date.parse('2026-12-01');
  assert.equal(projectMoney(usd, when).state, 'stale');
  assert.equal(projectMoney(later, when).state, 'projected');
});

test('all currencies preserve contraction, flat rates and leap-year interval lengths', () => {
  for (const money of snapshot.fiat) {
    const negative = structuredClone(money);
    negative.previousYear.amount = negative.latest.amount + 1e12;
    assert.ok(annualRate(negative) < 0);
    assert.ok(projectMoney(negative, Date.parse(negative.releasedAt) + DAY_MS).amount! < negative.latest.amount);
    const flat = structuredClone(money); flat.previousYear.amount = flat.latest.amount;
    assert.equal(annualRate(flat), 0);
    assert.equal(projectMoney(flat, Date.parse(flat.releasedAt)).amount, flat.latest.amount);
  }
  const leap = structuredClone(usd);
  leap.latest.month = '2024-08'; leap.previousYear.month = '2023-08'; leap.releasedAt = '2024-09-24';
  assert.equal(annualRate(leap), (leap.latest.amount - leap.previousYear.amount) / (366 * 86400));
  const impossible = structuredClone(usd); impossible.previousYear.amount *= 100;
  assert.deepEqual(projectMoney(impossible, Date.parse(impossible.releasedAt)), { amount: impossible.latest.amount, state: 'stale' });
});

test('wrong scaling, currency, windows, release date or native amounts fail only that monetary model', () => {
  for (const mutate of [
    (m: typeof usd) => { m.currency = 'EUR'; },
    (m: typeof usd) => { m.sourceMultiplier = 1e6; },
    (m: typeof usd) => { m.sourceUnit = 'millions'; },
    (m: typeof usd) => { m.series = 'M1SL'; },
    (m: typeof usd) => { m.basis = 'End of month'; },
    (m: typeof usd) => { m.previousYear.month = '2025-07'; },
    (m: typeof usd) => { m.latest.month = '2026-13'; },
    (m: typeof usd) => { m.latest.amount = Infinity; },
    (m: typeof usd) => { m.releasedAt = '2026-08-01'; },
    (m: typeof usd) => { m.checkedAt = '2026-09-01'; },
  ]) {
    const invalid = structuredClone(usd); mutate(invalid);
    assert.equal(isValidMoney(invalid), false);
    assert.equal(projectMoney(invalid, Date.parse('2026-10-10')).state, 'unavailable');
    assert.equal(projectMoney(snapshot.fiat[1], Date.parse('2026-10-10')).state, 'projected');
  }
  const duplicate = structuredClone(snapshot); duplicate.fiat[1] = duplicate.fiat[0];
  assert.equal(isValidSnapshot(duplicate), false);
});

test('unusable population and nonconsecutive July 1 points fail population validation', () => {
  for (const mutate of [
    (s: SupplySnapshot) => { s.population.persons = NaN; },
    (s: SupplySnapshot) => { s.population.points[1].date = '2026-01-01'; },
    (s: SupplySnapshot) => { s.population.points[1].persons += 1; },
    (s: SupplySnapshot) => { s.population.points[2].date = '2028-07-01'; },
    (s: SupplySnapshot) => { s.population.points[2].persons = Infinity; },
  ]) {
    const invalid = structuredClone(snapshot); mutate(invalid);
    assert.equal(isValidSnapshot(invalid), false);
    assert.equal(projectPopulation(invalid, Date.parse('2026-10-10')).state, 'unavailable');
  }
});

const fixture = `<div>Release Date: September 22, 2026</div><th id="t1tg1b2">M2</th><table>
<tr><th id="t1tg1r1">Aug. 2025</th><td headers="t1tg1a2 t1tg1b1 t1tg1r1">18,840.8</td><td headers="t1tg1a2 t1tg1b2 t1tg1r1">22,092.6</td><td headers="t1tg1a3 t1tg1b5 t1tg1r1">22,033.1</td></tr>
<tr><th id="t1tg1r2">Aug. 2026</th><td headers="t1tg1a2 t1tg1b1 t1tg1r2">19,991.1</td><td headers="t1tg1a2 t1tg1b2 t1tg1r2">23,342.8</td><td headers="t1tg1a3 t1tg1b5 t1tg1r2">23,284.3</td></tr></table>`;

test('Fed refresh selects seasonally adjusted M2, scales billions and preserves every other series', () => {
  assert.deepEqual(parseH6(fixture), { latest: usd.latest, previousYear: usd.previousYear, releasedAt: usd.releasedAt });
  const next = refreshedSnapshot(snapshot, fixture, '2026-10-11');
  assert.deepEqual(next.population, snapshot.population);
  assert.deepEqual(next.gold, snapshot.gold);
  assert.deepEqual(next.fiat.slice(1), snapshot.fiat.slice(1));
  assert.throws(() => parseH6(fixture.replace('22,092.6', '.')));
  assert.throws(() => parseH6(fixture.replace('id="t1tg1b2"', 'id="other"')));
  assert.throws(() => parseH6(fixture.replace('>M2</th>', '>M1</th>') + '<p>M2</p>'));
  assert.throws(() => refreshedSnapshot(snapshot, fixture.replaceAll('2026', '2024').replaceAll('2025', '2023'), '2026-10-11'));
});

const reviewed: ReviewedMoneyImport[] = snapshot.fiat.map(money => ({ id: money.id, sourceMultiplier: money.sourceMultiplier,
  latest: { month: money.latest.month, value: money.latest.amount / money.sourceMultiplier },
  previousYear: { month: money.previousYear.month, value: money.previousYear.amount / money.sourceMultiplier },
  releasedAt: money.releasedAt, source: money.source, dataSource: money.dataSource,
  previousDataSource: money.previousDataSource, definitionSource: money.definitionSource, note: money.note,
}));

test('reviewed imports scale each source unit and keep unrelated snapshots intact', () => {
  assert.deepEqual(reviewed.map(m => scaleSource(m.latest.value, m.sourceMultiplier)), snapshot.fiat.map(m => m.latest.amount));
  assert.deepEqual(importReviewedMoney(snapshot, reviewed, '2026-10-11'), { ...snapshot, checkedAt: '2026-10-11' });
  const partial = structuredClone(reviewed[1]); partial.latest.value += 1;
  const next = importReviewedMoney(snapshot, [partial], '2026-10-11');
  assert.equal(next.fiat[1].latest.amount, snapshot.fiat[1].latest.amount + 1e6);
  assert.deepEqual(next.fiat[0], usd);
  assert.deepEqual(next.population, snapshot.population);
  assert.deepEqual(next.gold, snapshot.gold);
});

test('failed imports, duplicates, wrong units and old releases leave valid snapshots untouched', () => {
  const before = JSON.stringify(snapshot);
  const bad = structuredClone(reviewed[1]); bad.sourceMultiplier = 1e9;
  assert.throws(() => importReviewedMoney(snapshot, [reviewed[0], bad], '2026-10-11'));
  assert.throws(() => importReviewedMoney(snapshot, [reviewed[0], reviewed[0]], '2026-10-11'));
  const missing = structuredClone(reviewed[1]); missing.previousYear.value = NaN;
  assert.throws(() => importReviewedMoney(snapshot, [missing], '2026-10-11'));
  const old = structuredClone(reviewed[4]); old.latest.month = '2025-08'; old.previousYear.month = '2024-08'; old.releasedAt = '2025-09-29';
  assert.throws(() => importReviewedMoney(snapshot, [old], '2026-10-11'));
  const unofficial = structuredClone(reviewed[1]); unofficial.source = 'https://example.com/data';
  assert.throws(() => importReviewedMoney(snapshot, [unofficial], '2026-10-11'));
  assert.equal(JSON.stringify(snapshot), before);
});
