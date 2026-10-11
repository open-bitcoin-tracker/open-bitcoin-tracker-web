import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as model from '../src/features/supply/model.ts';
import { currencies, supply } from '../src/i18n/supply.ts';

const snapshot = JSON.parse(readFileSync(new URL('../src/features/supply/snapshot.json', import.meta.url), 'utf8')) as model.SupplySnapshot;
const script = ts.transpileModule(readFileSync(new URL('../src/scripts/supply.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

class Control extends EventTarget {
  textContent = '';
  hidden = false;
  value = 'usd';
  checked = false;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  parentElement: Control | null = null;
  get selectedOptions() {
    const currency = currencies[this.value as keyof typeof currencies];
    return [{ textContent: this.value === 'gold' ? supply.gold : currency?.name, dataset: { symbol: currency?.symbol } }];
  }
  prepend(child: Control) { child.parentElement = this; }
  focus(_options?: FocusOptions) {}
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
}
function harness(reduced = false, when = Date.parse('2026-10-10T12:00:00Z'), data = snapshot) {
  let now = when;
  const controls = Object.fromEntries(['motion-status', 'population', 'population-label', 'population-status', 'btc-share', 'btc-basis', 'pause', 'pause-label', 'gold', 'gold-total', 'gold-share', 'gold-label', 'gold-status', 'asset-select', 'asset-picker', 'picker-gold', 'picker-symbol', 'picker-name', 'compare-all', 'comparison-controls'].map(name => [name, new Control()]));
  const shares = data.fiat.map(() => new Control());
  const panels = data.fiat.map((money, index) => {
    const children: Record<string, Control> = { ...Object.fromEntries(['money-total', 'total-label', 'status'].map(name => [name, new Control()])), 'money-share': shares[index] };
    return Object.assign(new Control(), { id: money.id, children, querySelector: (selector: string) => children[selector.slice(6, -1)] });
  });
  const root = { dataset: { motion: 'still', view: 'all' }, querySelector: (selector: string) => {
    if (selector.startsWith('[data-currency=')) return panels.find(p => selector.includes(`"${p.id}"`));
    if (selector.startsWith('[data-money-share=')) return shares[data.fiat.findIndex(money => selector.includes(`"${money.id}"`))];
    if (selector.startsWith('[data-projection-status=')) return panels.find(p => selector.includes(`"${p.id}"`))!.children.status;
    return controls[selector.slice(6, -1)];
  } };
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const document = Object.assign(new EventTarget(), { hidden: false, activeElement: null as Control | null, querySelector: () => root,
    getElementById: () => ({ textContent: JSON.stringify({ snapshot: data, locale: 'en-US', copy: supply }) }),
  });
  for (const panel of [controls.gold, ...panels]) {
    panel.prepend = (child: Control) => {
      child.parentElement = panel;
      const focused = document.activeElement === controls['asset-select'];
      document.activeElement = null;
      if (focused) controls['asset-select'].dispatchEvent(new Event('blur'));
    };
  }
  controls['asset-select'].focus = () => {
    document.activeElement = controls['asset-select'];
    controls['asset-select'].dispatchEvent(new Event('focus'));
  };
  let callback: (() => void) | undefined;
  const window = Object.assign(new EventTarget(), { matchMedia: () => media,
    setInterval: (fn: () => void) => { callback = fn; return 1; }, clearInterval: () => { callback = undefined; },
  });
  runInNewContext(script, { require: () => model, exports: {}, document, window, Date: { now: () => now } });
  return { controls, panels, shares, root, document, media, advance: (ms: number) => { now += ms; callback?.(); } };
}
const values = (h: ReturnType<typeof harness>) => h.panels.map((p, i) => [p.children['money-total'].textContent, h.shares[i].textContent]);

test('default pair is USD; all six assets switch both panel and per-person selection', () => {
  const h = harness(), bitcoin = h.controls['btc-share'].textContent;
  assert.equal(h.root.dataset.view, 'focus');
  assert.equal(h.controls['comparison-controls'].hidden, false);
  assert.equal(h.panels[0].attributes['data-selected'], 'true');
  assert.equal(h.panels[0].children['money-share'], h.shares[0]);
  assert.equal(h.controls['asset-picker'].parentElement, h.panels[0]);
  assert.equal(h.controls['asset-picker'].hidden, false);
  for (const id of ['gold', 'usd', 'eur', 'jpy', 'cny', 'gbp']) {
    h.document.activeElement = h.controls['asset-select'];
    h.controls['asset-select'].value = id;
    h.controls['asset-select'].dispatchEvent(new Event('change'));
    assert.equal(h.controls.gold.attributes['data-selected'], String(id === 'gold'));
    h.panels.forEach(panel => assert.equal(panel.attributes['data-selected'], String(panel.id === id)));
    const selectedPanel = id === 'gold' ? h.controls.gold : h.panels.find(panel => panel.id === id);
    assert.equal(h.controls['asset-picker'].parentElement, selectedPanel);
    assert.equal(h.document.activeElement, h.controls['asset-select']);
    assert.equal(h.controls['picker-gold'].hidden, id !== 'gold');
    assert.equal(h.controls['picker-symbol'].hidden, id === 'gold');
    assert.equal(h.controls['picker-name'].textContent, id === 'gold' ? supply.gold : currencies[id as keyof typeof currencies].name);
    if (id !== 'gold') assert.equal(h.controls['picker-symbol'].textContent, currencies[id as keyof typeof currencies].symbol);
    assert.equal(h.controls['btc-share'].textContent, bitcoin);
  }
  h.controls['asset-select'].value = 'chf';
  h.controls['asset-select'].dispatchEvent(new Event('change'));
  assert.equal(h.controls['asset-select'].value, 'gbp');
});

test('pointer selection stays borderless; keyboard focus survives selecting another card', () => {
  const h = harness(), select = h.controls['asset-select'], picker = h.controls['asset-picker'];
  h.document.dispatchEvent(new Event('pointerdown'));
  select.focus();
  select.value = 'eur'; select.dispatchEvent(new Event('change'));
  assert.equal(h.document.activeElement, select);
  assert.equal(picker.dataset.keyboardFocus, 'false');
  h.document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowDown' }));
  select.value = 'jpy'; select.dispatchEvent(new Event('change'));
  assert.equal(h.document.activeElement, select);
  assert.equal(picker.dataset.keyboardFocus, 'true');
  h.document.dispatchEvent(new Event('pointerdown'));
  assert.equal(picker.dataset.keyboardFocus, 'false');
  h.document.activeElement = null; select.dispatchEvent(new Event('blur'));
  h.document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Tab' }));
  select.focus();
  assert.equal(picker.dataset.keyboardFocus, 'true');
});

test('switching pair and overview preserves shared pause, fixed Bitcoin and chosen asset', () => {
  const h = harness(), bitcoin = h.controls['btc-share'].textContent;
  h.controls.pause.dispatchEvent(new Event('click'));
  const frozen = values(h), people = h.controls.population.textContent, gold = h.controls['gold-total'].textContent;
  h.controls['asset-select'].value = 'gold'; h.controls['asset-select'].dispatchEvent(new Event('change'));
  h.controls['compare-all'].checked = true; h.controls['compare-all'].dispatchEvent(new Event('change'));
  assert.equal(h.root.dataset.view, 'all');
  assert.equal(h.controls['asset-picker'].hidden, true);
  h.advance(60_000);
  assert.deepEqual(values(h), frozen);
  assert.equal(h.controls['gold-total'].textContent, gold);
  assert.equal(h.controls.population.textContent, people);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
  assert.equal(h.root.dataset.motion, 'paused');
  h.controls['compare-all'].checked = false; h.controls['compare-all'].dispatchEvent(new Event('change'));
  assert.equal(h.root.dataset.view, 'focus');
  assert.equal(h.controls['asset-picker'].hidden, false);
  assert.equal(h.controls['asset-select'].value, 'gold');
  assert.equal(h.controls.gold.attributes['data-selected'], 'true');
  assert.equal(h.controls.gold.dataset.goldMotion, 'paused');
  h.controls.pause.dispatchEvent(new Event('click'));
  assert.notEqual(h.controls['gold-total'].textContent, gold);
  assert.notDeepEqual(values(h), frozen);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
});

test('view changes preserve reduced motion and independently expired selected assets', () => {
  const h = harness(true, Date.parse('2026-11-15'));
  h.controls['asset-select'].value = 'gold'; h.controls['asset-select'].dispatchEvent(new Event('change'));
  h.controls['compare-all'].checked = true; h.controls['compare-all'].dispatchEvent(new Event('change'));
  assert.equal(h.controls.pause.hidden, true);
  assert.equal(h.controls.gold.dataset.goldMotion, 'still');
  assert.ok(h.panels.every(panel => panel.dataset.moneyMotion === 'still'));
  h.advance(2 * model.DAY_MS);
  h.controls['compare-all'].checked = false; h.controls['compare-all'].dispatchEvent(new Event('change'));
  assert.equal(h.controls['gold-total'].textContent, model.formatNumber(snapshot.gold.stock.tonnes, 'en-US'));
  assert.equal(h.controls['gold-status'].textContent, supply.goldStale);
  assert.equal(h.controls.gold.attributes['data-selected'], 'true');
  assert.equal(h.controls['motion-status'].textContent, supply.reduced);
  assert.equal(h.root.dataset.motion, 'still');
});

test('one pause freezes gold, five fiats and population; Bitcoin remains fixed on resume', () => {
  const h = harness();
  const initial = values(h), people = h.controls.population.textContent, bitcoin = h.controls['btc-share'].textContent;
  const initialGold = h.controls['gold-total'].textContent;
  h.advance(10_000);
  assert.notEqual(h.controls['gold-total'].textContent, initialGold);
  assert.equal(h.controls.gold.dataset.goldMotion, 'running');
  h.panels.forEach((p, i) => { assert.notEqual(p.children['money-total'].textContent, initial[i][0]); assert.equal(p.dataset.moneyMotion, 'running'); });
  assert.notEqual(h.controls.population.textContent, people);
  h.controls.pause.dispatchEvent(new Event('click'));
  const frozen = values(h), frozenPeople = h.controls.population.textContent;
  const frozenGold = h.controls['gold-total'].textContent, frozenGoldShare = h.controls['gold-share'].textContent;
  h.advance(60_000);
  assert.deepEqual(values(h), frozen);
  assert.equal(h.controls.population.textContent, frozenPeople);
  assert.equal(h.controls['gold-total'].textContent, frozenGold);
  assert.equal(h.controls['gold-share'].textContent, frozenGoldShare);
  assert.equal(h.controls.gold.dataset.goldMotion, 'paused');
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
  assert.equal(h.root.dataset.motion, 'paused');
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'paused'));
  assert.equal(h.controls.pause.attributes['aria-pressed'], 'true');
  h.controls.pause.dispatchEvent(new Event('click'));
  assert.notEqual(h.controls['gold-total'].textContent, frozenGold);
  h.panels.forEach((p, i) => assert.notEqual(p.children['money-total'].textContent, frozen[i][0]));
  assert.notEqual(h.controls.population.textContent, frozenPeople);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
});

test('gold and fiat shares use their own amounts and population at the same shown time', () => {
  const when = Date.parse('2026-10-10T12:00:00Z'), h = harness(false, when);
  const population = model.projectPopulation(snapshot, when).persons!;
  assert.equal(h.controls['btc-share'].textContent, model.formatNumber(model.equalShare(model.BITCOIN_MAX, population), 'en-US', 8));
  assert.ok(h.controls['btc-basis'].textContent.includes(model.formatNumber(population, 'en-US')));
  h.advance(10 * model.DAY_MS);
  const later = when + 10 * model.DAY_MS;
  assert.equal(h.controls['gold-share'].textContent, model.formatNumber(model.goldShareGrams(model.projectGold(snapshot.gold, later).tonnes!, model.projectPopulation(snapshot, later).persons!), 'en-US', 2));
  h.panels.forEach((p, i) => {
    const amount = model.projectMoney(snapshot.fiat[i], later).amount!;
    assert.equal(h.shares[i].textContent, model.formatNumber(model.equalShare(amount, model.projectPopulation(snapshot, later).persons!), 'en-US'));
  });
});

test('reduced motion freezes all estimates, hides pause and responds to preference changes', () => {
  const h = harness(true), initial = values(h), people = h.controls.population.textContent;
  const gold = h.controls['gold-total'].textContent;
  h.advance(10_000);
  assert.deepEqual(values(h), initial);
  assert.equal(h.controls.population.textContent, people);
  assert.equal(h.controls['gold-total'].textContent, gold);
  assert.equal(h.controls.gold.dataset.goldMotion, 'still');
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

test('flat or invalid gold stays still while other models keep running', () => {
  for (const mining of [0, -1]) {
    const data = structuredClone(snapshot); data.gold.mineProduction.tonnes = mining;
    const h = harness(false, Date.parse('2026-10-11'), data);
    assert.equal(h.controls.gold.dataset.goldMotion, 'still');
    assert.equal(h.controls['gold-total'].textContent, model.formatNumber(data.gold.stock.tonnes, 'en-US', mining < 0 ? 0 : 3));
    assert.equal(h.panels[0].dataset.moneyMotion, 'running');
    assert.equal(h.controls['gold-status'].textContent, mining < 0 ? supply.goldUnavailable : '');
  }
});

test('gold expiry is checked while paused and does not stop fiat or population controls', () => {
  const h = harness(false, Date.parse('2026-11-15'));
  h.controls.pause.dispatchEvent(new Event('click'));
  h.advance(2 * model.DAY_MS);
  assert.equal(h.controls.gold.dataset.goldMotion, 'still');
  assert.equal(h.controls['gold-status'].textContent, supply.goldStale);
  assert.equal(h.controls['gold-total'].textContent, model.formatNumber(snapshot.gold.stock.tonnes, 'en-US'));
  assert.ok(h.panels.every(panel => panel.dataset.moneyMotion === 'paused'));
  assert.equal(h.root.dataset.motion, 'paused');
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
  assert.equal(h.controls.gold.dataset.goldMotion, 'still');
  assert.equal(h.controls.pause.hidden, true);
  assert.equal(h.controls.population.textContent, model.formatNumber(snapshot.population.points.at(-1)!.persons, 'en-US'));
  assert.equal(h.controls['population-label'].textContent, supply.populationRecorded);
  assert.ok(h.controls['population-status'].textContent.includes('July 1, 2028'));
});

test('hidden pages stop all timers and catch up from the clock without changing Bitcoin', () => {
  const h = harness(), initial = values(h), people = h.controls.population.textContent, bitcoin = h.controls['btc-share'].textContent;
  const gold = h.controls['gold-total'].textContent;
  h.document.hidden = true; h.document.dispatchEvent(new Event('visibilitychange'));
  h.advance(10_000);
  assert.deepEqual(values(h), initial);
  assert.equal(h.controls.population.textContent, people);
  assert.equal(h.controls['gold-total'].textContent, gold);
  assert.equal(h.controls.gold.dataset.goldMotion, 'still');
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'still'));
  h.document.hidden = false; h.document.dispatchEvent(new Event('visibilitychange'));
  h.panels.forEach((p, i) => assert.notEqual(p.children['money-total'].textContent, initial[i][0]));
  assert.notEqual(h.controls.population.textContent, people);
  assert.notEqual(h.controls['gold-total'].textContent, gold);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
});
