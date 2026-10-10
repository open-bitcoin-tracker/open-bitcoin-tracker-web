import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as model from '../src/features/supply/model.ts';
import { supply } from '../src/i18n/supply.ts';

const snapshot = JSON.parse(readFileSync(new URL('../src/features/supply/snapshot.json', import.meta.url), 'utf8')) as model.SupplySnapshot;
const script = ts.transpileModule(readFileSync(new URL('../src/scripts/supply.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

class Control extends EventTarget {
  textContent = '';
  hidden = false;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
}
function harness(reduced = false, when = Date.parse('2026-10-10T12:00:00Z'), data = snapshot) {
  let now = when;
  const controls = Object.fromEntries(['motion-status', 'population', 'population-label', 'population-status', 'btc-share', 'satoshi-share', 'btc-basis', 'pause', 'pause-label'].map(name => [name, new Control()]));
  const panels = data.fiat.map(money => {
    const children = Object.fromEntries(['money-total', 'money-share', 'total-label', 'status'].map(name => [name, new Control()]));
    return Object.assign(new Control(), { id: money.id, children, querySelector: (selector: string) => children[selector.slice(6, -1)] });
  });
  const root = { dataset: { motion: 'still' }, querySelector: (selector: string) => {
    if (selector.startsWith('[data-currency=')) return panels.find(p => selector.includes(`"${p.id}"`));
    if (selector.startsWith('[data-projection-status=')) return panels.find(p => selector.includes(`"${p.id}"`))!.children.status;
    return controls[selector.slice(6, -1)];
  } };
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const document = Object.assign(new EventTarget(), { hidden: false, querySelector: () => root,
    getElementById: () => ({ textContent: JSON.stringify({ snapshot: data, locale: 'en-US', copy: supply }) }),
  });
  let callback: (() => void) | undefined;
  const window = Object.assign(new EventTarget(), { matchMedia: () => media,
    setInterval: (fn: () => void) => { callback = fn; return 1; }, clearInterval: () => { callback = undefined; },
  });
  runInNewContext(script, { require: () => model, exports: {}, document, window, Date: { now: () => now } });
  return { controls, panels, root, document, media, advance: (ms: number) => { now += ms; callback?.(); } };
}
const values = (h: ReturnType<typeof harness>) => h.panels.map(p => [p.children['money-total'].textContent, p.children['money-share'].textContent]);

test('one pause freezes all five fiat totals, shares, population and bills; Bitcoin remains fixed on resume', () => {
  const h = harness();
  const initial = values(h), people = h.controls.population.textContent, bitcoin = h.controls['btc-share'].textContent;
  h.advance(1_000);
  h.panels.forEach((p, i) => { assert.notEqual(p.children['money-total'].textContent, initial[i][0]); assert.equal(p.dataset.moneyMotion, 'running'); });
  assert.notEqual(h.controls.population.textContent, people);
  h.controls.pause.dispatchEvent(new Event('click'));
  const frozen = values(h), frozenPeople = h.controls.population.textContent;
  h.advance(60_000);
  assert.deepEqual(values(h), frozen);
  assert.equal(h.controls.population.textContent, frozenPeople);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
  assert.equal(h.root.dataset.motion, 'paused');
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'paused'));
  assert.equal(h.controls.pause.attributes['aria-pressed'], 'true');
  h.controls.pause.dispatchEvent(new Event('click'));
  h.panels.forEach((p, i) => assert.notEqual(p.children['money-total'].textContent, frozen[i][0]));
  assert.notEqual(h.controls.population.textContent, frozenPeople);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
});

test('every fiat share uses its own native amount and population at the same shown time', () => {
  const when = Date.parse('2026-10-10T12:00:00Z'), h = harness(false, when);
  const population = model.projectPopulation(snapshot, when).persons!;
  assert.equal(h.controls['btc-share'].textContent, model.formatNumber(model.equalShare(model.BITCOIN_MAX, population), 'en-US', 8));
  assert.ok(h.controls['btc-basis'].textContent.includes(model.formatNumber(population, 'en-US')));
  h.advance(10 * model.DAY_MS);
  const later = when + 10 * model.DAY_MS;
  h.panels.forEach((p, i) => {
    const amount = model.projectMoney(snapshot.fiat[i], later).amount!;
    assert.equal(p.children['money-share'].textContent, model.formatNumber(model.equalShare(amount, model.projectPopulation(snapshot, later).persons!), 'en-US'));
  });
});

test('reduced motion freezes all estimates, hides pause and responds to preference changes', () => {
  const h = harness(true), initial = values(h), people = h.controls.population.textContent;
  h.advance(10_000);
  assert.deepEqual(values(h), initial);
  assert.equal(h.controls.population.textContent, people);
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'still'));
  assert.equal(h.controls.pause.hidden, true);
  assert.equal(h.controls['motion-status'].textContent, supply.reduced);
  h.media.matches = false; h.media.dispatchEvent(new Event('change'));
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'running'));
  h.advance(2_000);
  h.media.matches = true; h.media.dispatchEvent(new Event('change'));
  const frozen = values(h), frozenPeople = h.controls.population.textContent;
  h.advance(30_000);
  assert.deepEqual(values(h), frozen);
  assert.equal(h.controls.population.textContent, frozenPeople);
});

test('flat and unavailable series do not borrow motion from other currencies or population', () => {
  const data = structuredClone(snapshot);
  data.fiat[1].previousYear.amount = data.fiat[1].latest.amount;
  data.fiat[2].currency = 'USD';
  const h = harness(false, Date.parse('2026-10-10'), data);
  assert.equal(h.panels[0].dataset.moneyMotion, 'running');
  assert.equal(h.panels[1].dataset.moneyMotion, 'still');
  assert.equal(h.panels[2].dataset.moneyMotion, 'still');
  assert.equal(h.panels[2].children.status.textContent, supply.unavailable);
  assert.equal(h.controls.pause.hidden, false);
});

test('each series expires independently and range checks continue while paused', () => {
  const data = structuredClone(snapshot);
  data.fiat[1].latest.month = '2026-09'; data.fiat[1].previousYear.month = '2025-09';
  data.fiat[1].releasedAt = '2026-10-09';
  const h = harness(false, Date.parse('2026-11-29'), data);
  h.controls.pause.dispatchEvent(new Event('click'));
  h.advance(3 * model.DAY_MS);
  assert.equal(h.panels[0].dataset.moneyMotion, 'still');
  assert.equal(h.panels[0].children['money-total'].textContent, model.formatNumber(data.fiat[0].latest.amount, 'en-US'));
  assert.equal(h.panels[0].children.status.textContent, supply.stale);
  assert.equal(h.panels[1].dataset.moneyMotion, 'paused');
  assert.equal(h.panels[1].children.status.textContent, '');
  assert.equal(h.root.dataset.motion, 'paused');
  h.controls.pause.dispatchEvent(new Event('click'));
  assert.equal(h.panels[1].dataset.moneyMotion, 'running');
  assert.equal(h.panels[0].dataset.moneyMotion, 'still');
});

test('outside both model ranges all motion stops and the nearest annual population is shown', () => {
  const h = harness();
  h.controls.pause.dispatchEvent(new Event('click'));
  h.advance(3 * 366 * model.DAY_MS);
  assert.equal(h.root.dataset.motion, 'still');
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'still'));
  assert.equal(h.controls.pause.hidden, true);
  assert.equal(h.controls.population.textContent, model.formatNumber(snapshot.population.points.at(-1)!.persons, 'en-US'));
  assert.equal(h.controls['population-label'].textContent, supply.populationRecorded);
  assert.ok(h.controls['population-status'].textContent.includes('July 1, 2028'));
});

test('hidden pages stop all timers and catch up from the clock without changing Bitcoin', () => {
  const h = harness(), initial = values(h), people = h.controls.population.textContent, bitcoin = h.controls['btc-share'].textContent;
  h.document.hidden = true; h.document.dispatchEvent(new Event('visibilitychange'));
  h.advance(10_000);
  assert.deepEqual(values(h), initial);
  assert.equal(h.controls.population.textContent, people);
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'still'));
  h.document.hidden = false; h.document.dispatchEvent(new Event('visibilitychange'));
  h.panels.forEach((p, i) => assert.notEqual(p.children['money-total'].textContent, initial[i][0]));
  assert.notEqual(h.controls.population.textContent, people);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
});
