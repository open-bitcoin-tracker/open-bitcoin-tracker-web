import { browserModule } from './support/browser-module.ts';
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
  checked = false;
  disabled = false;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  inert = false;
  hasAttribute(name: string) { return name in this.attributes; }
  matches(_selector: string) { return this.attributes['aria-pressed'] === 'true'; }
  removeAttribute(name: string) { delete this.attributes[name]; }
  getClientRects() { return this.hidden ? [] : [{}]; }
  closest(selector: string): Control | null {
    if (selector === '[inert]') {
      let control: Control | null = this;
      while (control) { if (control.inert) return control; control = control.parentElement; }
    }
    return null;
  }
  querySelectorAll(_selector: string): Control[] { return []; }
  parentElement: Control | null = null;
  private expanded = false;
  get open() { return this.expanded; }
  set open(value: boolean) {
    if (this.expanded === value) return;
    this.expanded = value;
    this.dispatchEvent(new Event('toggle'));
  }
  contains(node: unknown): boolean {
    while (node instanceof Control) {
      if (node === this) return true;
      node = node.parentElement;
    }
    return false;
  }
  prepend(child: Control) { child.parentElement = this; }
  append(child: Control) { child.parentElement = this; }
  scrollTop = 0;
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  focus(_options?: FocusOptions) {}
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
}
function harness(reduced = false, when = Date.parse('2026-10-10T12:00:00Z'), data = snapshot) {
  let now = when;
  const controls = Object.fromEntries(['motion-status', 'population', 'population-status', 'btc-share', 'btc-total', 'asset-trigger', 'asset-menu', 'asset-picker', 'picker-name', 'static-asset-heading', 'year-controls', 'year-previous', 'year-next', 'selected-year', 'scenario-note', 'method-trigger', 'method-dialog', 'method-close', 'method-body', 'method-content', 'method-fallback', 'method-overview', 'method-overview-body', 'method-title', 'method-detail', 'method-detail-title', 'method-back'].map(name => [name, new Control()]));
  const sectionTriggers = ['bitcoin', 'money', 'scenario', 'population'].map(id => Object.assign(new Control(), { dataset: { methodSectionTrigger: id }, textContent: id, parentElement: controls['method-overview'] }));
  const sections = sectionTriggers.map(trigger => Object.assign(new Control(), { dataset: { methodSection: trigger.dataset.methodSectionTrigger } }));
  controls['method-back'].parentElement = controls['method-detail'];
  controls['method-close'].parentElement = controls['method-overview'];
  const detailLink = Object.assign(new Control(), { parentElement: controls['method-detail'] });
  controls['method-dialog'].querySelectorAll = () => [controls['method-close'], ...sectionTriggers, controls['method-back'], detailLink];
  const methodCurrencies = data.fiat.map(money => Object.assign(new Control(), { dataset: { methodCurrency: money.id } }));
  const options = data.fiat.map(money => money.id).map(id => Object.assign(new Control(), {
    textContent: currencies[id as keyof typeof currencies].name,
    dataset: { assetOption: String(id) },
    parentElement: controls['asset-menu'],
  }));
  Object.assign(controls['asset-menu'], {
    querySelector: () => controls['asset-trigger'],
    querySelectorAll: () => options,
  });
  controls['asset-menu'].setAttribute('data-menu-navigation', '');
  controls['asset-trigger'].setAttribute('aria-expanded', 'false');
  controls['asset-menu'].parentElement = controls['asset-picker'];
  controls['asset-trigger'].parentElement = controls['asset-menu'];
  const shares = data.fiat.map(() => new Control());
  const shareCards = data.fiat.map(() => new Control());
  const panels = data.fiat.map((money, index) => {
    const children: Record<string, Control> = Object.fromEntries(['money-total', 'total-label', 'status'].map(name => [name, new Control()]));
    shares[index].parentElement = shareCards[index];
    return Object.assign(new Control(), { id: money.id, children, querySelector: (selector: string) => children[selector.slice(6, -1)] });
  });
  const root = { dataset: { motion: 'still' } as Record<string, string>, querySelectorAll: (selector: string) => selector === '[data-method-section-trigger]' ? sectionTriggers : selector === '[data-method-section]' ? sections : selector === '[data-method-close]' ? [controls['method-close']] : selector === '[data-method-currency]' ? methodCurrencies : selector === '[data-asset-option]' ? options : [], querySelector: (selector: string) => {
    if (selector.startsWith('[data-share-asset=')) return shareCards[data.fiat.findIndex(money => selector.includes(`"${money.id}"`))];
    if (selector.startsWith('[data-currency=')) return panels.find(p => selector.includes(`"${p.id}"`));
    if (selector.startsWith('[data-money-share=')) return shares[data.fiat.findIndex(money => selector.includes(`"${money.id}"`))];
    if (selector.startsWith('[data-total-label=')) return panels.find(p => selector.includes(`"${p.id}"`))!.children['total-label'];
    if (selector.startsWith('[data-projection-status=')) return panels.find(p => selector.includes(`"${p.id}"`))!.children.status;
    return controls[selector.slice(6, -1)];
  } };
  const narrow = Object.assign(new EventTarget(), { matches: false });
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const document = Object.assign(new EventTarget(), { hidden: false, activeElement: null as Control | null, querySelector: () => root,
    getElementById: () => ({ textContent: JSON.stringify({ snapshot: data, locale: 'en-US', copy: supply }) }),
  });
  for (const panel of panels) {
    panel.prepend = (child: Control) => {
      child.parentElement = panel;
      if (controls['asset-picker'].contains(document.activeElement)) document.activeElement = null;
    };
  }
  for (const control of [...Object.values(controls), ...options, ...sectionTriggers, detailLink]) control.focus = () => {
    document.activeElement = control;
    document.dispatchEvent(new Event('focusin'));
  };
  let callback: (() => void) | undefined;
  let closeCallback: (() => void) | undefined;
  const window = Object.assign(new EventTarget(), { matchMedia: (query: string) => query.includes('max-width') ? narrow : media,
    setTimeout: (fn: () => void) => { closeCallback = fn; return 2; }, clearTimeout: () => { closeCallback = undefined; },
    setInterval: (fn: () => void) => { callback = fn; return 1; }, clearInterval: () => { callback = undefined; },
  });
  class ClockDate extends Date { static now() { return now; } }
  const globals = { document, window, Date: ClockDate };
  const modules = { ...model, ...browserModule('lib/disclosure-menu', globals), ...browserModule('lib/guide-drawer', globals) };
  runInNewContext(script, { ...globals, require: () => modules, exports: {} });
  return { controls, panels, shares, shareCards, options, methodCurrencies, root, document, media, narrow, sectionTriggers, sections, detailLink,
    finishClose: () => closeCallback?.(),
    key: (key: string) => controls['asset-menu'].dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key })),
    advance: (ms: number) => { now += ms; callback?.(); } };
}
const values = (h: ReturnType<typeof harness>) => h.panels.map((p, i) => [p.children['money-total'].textContent, h.shares[i].textContent]);
const selectAsset = (h: ReturnType<typeof harness>, id: string) => {
  const option = h.options.find(option => option.dataset.assetOption === id)!;
  h.controls['asset-menu'].open = true;
  option.focus(); option.dispatchEvent(new Event('click'));
};

const yearClick = (h: ReturnType<typeof harness>, action: 'next' | 'previous') => h.controls[`year-${action}`].dispatchEvent(new Event('click'));
const returnToCurrentYear = (h: ReturnType<typeof harness>) => {
  while (!h.controls['year-previous'].disabled) yearClick(h, 'previous');
};

test('sources panel follows the selected fiat on every opening and restores focus after dismissal', () => {
  const h = harness();
  const { controls } = h;
  const initialTotals = values(h);
  assert.equal(controls['method-fallback'].hidden, true);
  assert.equal(controls['method-content'].parentElement, controls['method-body']);
  assert.equal(controls['method-trigger'].hidden, false);
  for (const money of snapshot.fiat) {
    selectAsset(h, money.id);
    controls['method-overview-body'].scrollTop = 500;
    controls['method-trigger'].dispatchEvent(new Event('click'));
    assert.equal(controls['method-dialog'].open, true);
    assert.equal(controls['method-overview-body'].scrollTop, 0);
    assert.deepEqual(h.methodCurrencies.filter(currency => !currency.hidden).map(currency => currency.dataset.methodCurrency), [money.id]);
    controls['method-close'].dispatchEvent(new Event('click'));
    h.finishClose();
    assert.equal(controls['method-dialog'].open, false);
    assert.equal(h.document.activeElement, controls['method-trigger']);
  }
  assert.deepEqual(values(h), initialTotals);
  yearClick(h, 'next');
  controls['method-trigger'].dispatchEvent(new Event('click'));
  assert.equal(h.root.dataset.mode, 'scenario');
  assert.equal(controls['scenario-note'].textContent.includes('Scenario:'), true);
  controls['method-dialog'].dispatchEvent(new Event('click'));
  h.finishClose();
  assert.equal(controls['method-dialog'].open, false);
  assert.equal(h.document.activeElement, controls['method-trigger']);
});

test('section navigation opens only its content and Escape returns focus before closing', () => {
  const h = harness();
  const { controls } = h;
  controls['method-trigger'].dispatchEvent(new Event('click'));
  assert.equal(h.document.activeElement, controls['method-title']);
  for (const trigger of h.sectionTriggers) {
    controls['method-body'].scrollTop = 500;
    trigger.dispatchEvent(new Event('click'));
    assert.equal(controls['method-detail'].inert, false);
    assert.equal(controls['method-overview'].inert, false);
    assert.equal(controls['method-body'].scrollTop, 0);
    assert.equal(h.document.activeElement, controls['method-detail-title']);
    assert.equal(controls['method-detail-title'].textContent, trigger.textContent);
    assert.deepEqual(h.sections.filter(section => !section.hidden).map(section => section.dataset.methodSection), [trigger.dataset.methodSectionTrigger]);
    assert.equal(trigger.attributes['aria-expanded'], 'true');
  }
  const cancel = () => controls['method-dialog'].dispatchEvent(new Event('cancel', { cancelable: true }));
  cancel();
  assert.equal(controls['method-dialog'].open, true);
  assert.equal(controls['method-detail'].inert, true);
  assert.equal(h.document.activeElement, h.sectionTriggers.at(-1));
  cancel();
  assert.equal(controls['method-dialog'].attributes['data-closing'], '');
  h.finishClose();
  assert.equal(controls['method-dialog'].open, false);
  assert.equal(h.document.activeElement, controls['method-trigger']);
});

test('mobile details exclude the overview from keyboard navigation and Back restores the entry', () => {
  const h = harness(true);
  const { controls } = h;
  controls['method-trigger'].dispatchEvent(new Event('click'));
  h.sectionTriggers[0].dispatchEvent(new Event('click'));
  h.narrow.matches = true;
  h.narrow.dispatchEvent(new Event('change'));
  assert.equal(controls['method-overview'].inert, true);
  const tab = (shiftKey = false) => controls['method-dialog'].dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Tab', shiftKey }));
  tab();
  assert.equal(h.document.activeElement, controls['method-back']);
  tab(true);
  assert.equal(h.document.activeElement, h.detailLink);
  controls['method-back'].dispatchEvent(new Event('click'));
  assert.equal(controls['method-overview'].inert, false);
  assert.equal(controls['method-detail'].inert, true);
  assert.equal(h.document.activeElement, h.sectionTriggers[0]);
  controls['method-close'].dispatchEvent(new Event('click'));
  assert.equal(controls['method-dialog'].open, false);
  controls['method-trigger'].dispatchEvent(new Event('click'));
  assert.equal(controls['method-detail'].inert, true);
  assert.equal(controls['method-dialog'].attributes['data-detail-open'], undefined);
});

test('Bitcoin uses whole satoshis exclusively and rounds only after converting the unrounded share', () => {
  const when = Date.parse('2026-10-12T16:00:00Z'), h = harness(false, when);
  const people = model.projectPopulation(snapshot, when).persons!;
  assert.equal(h.controls['btc-total'].textContent, '2,100,000,000,000,000');
  assert.equal(h.controls['btc-share'].textContent, model.formatNumber(model.BITCOIN_MAX * model.SATOSHIS_PER_BTC / people, 'en-US'));
  // Use a flat, known denominator to check native satoshi scaling and rounding.
  const data = structuredClone(snapshot);
  data.population.points = [{ date: '2026-07-01', persons: 8_232_000_000 }, { date: '2027-07-01', persons: 8_232_000_000 }];
  data.population.persons = 8_232_000_000;
  const exact = harness(false, when, data);
  assert.equal(exact.controls['btc-share'].textContent, '255,102');
  const original = h.controls['btc-share'].textContent;
  h.advance(10 * model.DAY_MS);
  selectAsset(h, 'gbp');
  assert.equal(h.controls['btc-share'].textContent, original);
  yearClick(h, 'next');
  assert.equal(h.controls['btc-total'].textContent, '2,100,000,000,000,000');
  assert.notEqual(h.controls['btc-share'].textContent, original);
  returnToCurrentYear(h);
  assert.equal(h.controls['btc-share'].textContent, original);
});

test('year controls cover today through fifteen years with synchronized totals and shares for every asset', () => {
  const visit = Date.parse('2026-10-12T16:00:00Z'), h = harness(false, visit);
  assert.equal(h.controls['year-controls'].hidden, false);
  assert.equal(h.controls['selected-year'].textContent, '2026');
  assert.equal(h.controls['year-previous'].disabled, true);
  assert.ok(h.panels.every(p => p.children['total-label'].textContent.endsWith('· projection')));
  for (let years = 1; years <= 15; years++) {
    yearClick(h, 'next');
    const at = model.scenarioDate(visit, years), people = model.scenarioPopulation(snapshot, at)!;
    assert.equal(h.root.dataset.mode, 'scenario');
    assert.equal(h.controls['selected-year'].textContent, `${2026 + years}`);
    assert.equal(h.controls.population.textContent, model.formatNumber(people, 'en-US'));
    assert.equal(h.controls['btc-share'].textContent, model.formatNumber(model.BITCOIN_MAX * model.SATOSHIS_PER_BTC / people, 'en-US'));
    assert.equal(h.controls['btc-total'].textContent, '2,100,000,000,000,000');
    for (const [index, money] of snapshot.fiat.entries()) {
      selectAsset(h, money.id);
      const amount = model.scenarioMoney(money, at)!;
      assert.equal(h.panels[index].children['money-total'].textContent, model.formatNumber(amount, 'en-US'));
      assert.equal(h.shares[index].textContent, model.formatNumber(amount / people, 'en-US'));
      assert.equal(h.panels[index].children['total-label'].textContent, `${money.aggregate} · scenario estimate`);
      assert.equal(h.panels[index].children.status.textContent, '');
      assert.equal(h.controls['btc-share'].textContent, model.formatNumber(model.BITCOIN_MAX * model.SATOSHIS_PER_BTC / people, 'en-US'));
    }
    selectAsset(h, 'gbp');
    assert.equal(h.root.dataset.motion, 'running');
    assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'running'));
    assert.ok(h.controls['scenario-note'].textContent.includes(`October 12, ${2026 + years}`));
  }
  assert.equal(h.controls['year-next'].disabled, true);
  yearClick(h, 'next');
  assert.equal(h.controls['selected-year'].textContent, '2041');
  yearClick(h, 'previous');
  assert.equal(h.controls['selected-year'].textContent, '2040');
  assert.equal(h.controls['year-next'].disabled, false);
  returnToCurrentYear(h);
  assert.equal(h.root.dataset.mode, 'today');
  yearClick(h, 'previous');
  assert.equal(h.controls['selected-year'].textContent, '2026');
});

test('year changes preserve satoshi shares, asset and reduced motion; stepping back restores the visit basis', () => {
  const h = harness(true), original = values(h), people = h.controls.population.textContent;
  selectAsset(h, 'eur');
  const originalSats = h.controls['btc-share'].textContent;
  yearClick(h, 'next');
  assert.equal(h.controls['picker-name'].textContent, currencies.eur.name);
  assert.notEqual(h.controls['btc-share'].textContent, originalSats);
  const future = values(h), futurePeople = h.controls.population.textContent;
  h.advance(60_000);
  assert.deepEqual(values(h), future);
  assert.equal(h.controls.population.textContent, futurePeople);
  h.document.hidden = true; h.document.dispatchEvent(new Event('visibilitychange'));
  h.advance(60_000);
  h.document.hidden = false; h.document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(values(h), future);
  yearClick(h, 'previous');
  assert.equal(h.root.dataset.mode, 'today');
  assert.equal(h.root.dataset.motion, 'still');
  assert.deepEqual(values(h), original);
  assert.equal(h.controls.population.textContent, people);
  assert.equal(h.controls['btc-share'].textContent, originalSats);
});

test('future mode remains separate from expiry and stepping back checks the real clock under reduced motion', () => {
  const h = harness(true, Date.parse('2026-11-15'));
  yearClick(h, 'next');
  h.advance(20 * model.DAY_MS);
  returnToCurrentYear(h);
  assert.equal(h.panels[0].children.status.textContent, supply.stale);
  yearClick(h, 'next');
  assert.equal(h.panels[0].children.status.textContent, '');
});

test('future counters and symbolic assets keep moving on the shared clock, including after today expires', () => {
  const when = Date.parse('2026-12-01T12:00:00Z'), h = harness(false, when);
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'still'));
  yearClick(h, 'next');
  const before = values(h);
  const people = h.controls.population.textContent, bitcoin = h.controls['btc-share'].textContent;
  assert.equal(h.root.dataset.motion, 'running');
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'running'));
  h.advance(10 * model.DAY_MS);
  assert.notDeepEqual(values(h), before);
  assert.notEqual(h.controls.population.textContent, people);
  assert.notEqual(h.controls['btc-share'].textContent, bitcoin);
  const at = model.scenarioDate(when + 10 * model.DAY_MS, 1), population = model.scenarioPopulation(snapshot, at)!;
  assert.equal(h.controls['btc-share'].textContent, model.formatNumber(model.BITCOIN_MAX * model.SATOSHIS_PER_BTC / population, 'en-US'));
  h.panels.forEach((p, index) => {
    const amount = model.scenarioMoney(snapshot.fiat[index], at)!;
    assert.equal(p.children['money-total'].textContent, model.formatNumber(amount, 'en-US'));
    assert.equal(h.shares[index].textContent, model.formatNumber(amount / population, 'en-US'));
  });
  selectAsset(h, 'gbp');
  h.advance(60_000);
  h.document.hidden = true; h.document.dispatchEvent(new Event('visibilitychange'));
  const hidden = values(h);
  assert.equal(h.root.dataset.motion, 'still');
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'still'));
  h.advance(60_000);
  assert.deepEqual(values(h), hidden);
  h.document.hidden = false; h.document.dispatchEvent(new Event('visibilitychange'));
  assert.notDeepEqual(values(h), hidden);
  assert.equal(h.root.dataset.motion, 'running');
});

test('future reduced motion freezes all estimates; motion and switching retain the year offset', () => {
  const h = harness(true);
  yearClick(h, 'next');
  const frozen = values(h), people = h.controls.population.textContent, bitcoin = h.controls['btc-share'].textContent;
  h.advance(10 * model.DAY_MS);
  assert.deepEqual(values(h), frozen);
  assert.equal(h.controls.population.textContent, people);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
  assert.equal(h.root.dataset.motion, 'still');
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'still'));
  selectAsset(h, 'jpy');
  yearClick(h, 'next');
  assert.equal(h.controls['selected-year'].textContent, '2028');
  assert.equal(h.root.dataset.motion, 'still');
  const shifted = values(h);
  h.advance(60_000);
  assert.deepEqual(values(h), shifted);
  h.media.matches = false; h.media.dispatchEvent(new Event('change'));
  assert.equal(h.root.dataset.motion, 'running');
  assert.notDeepEqual(values(h), shifted);
  assert.equal(h.controls['picker-name'].textContent, currencies.jpy.name);
  h.media.matches = true; h.media.dispatchEvent(new Event('change'));
  const reduced = values(h), reducedBitcoin = h.controls['btc-share'].textContent;
  const reducedPeople = h.controls.population.textContent;
  h.advance(10 * model.DAY_MS);
  assert.deepEqual(values(h), reduced);
  assert.equal(h.controls['btc-share'].textContent, reducedBitcoin);
  assert.equal(h.controls.population.textContent, reducedPeople);
  assert.equal(h.root.dataset.motion, 'still');
  assert.equal(h.controls['motion-status'].textContent, supply.reduced);
  h.media.matches = false; h.media.dispatchEvent(new Event('change'));
  assert.equal(h.controls['selected-year'].textContent, '2028');
  assert.equal(h.root.dataset.motion, 'running');
  assert.notDeepEqual(values(h), reduced);
});

test('future flat, invalid and exhausted assets stay still without borrowing another model’s motion', () => {
  const data = structuredClone(snapshot);
  data.fiat[0].previousYear.amount = data.fiat[0].latest.amount;
  data.fiat[1].previousYear.amount = data.fiat[1].latest.amount + 1e11;
  data.fiat[2].currency = 'USD';
  data.fiat[3].previousYear.amount *= 100;
  const h = harness(false, Date.parse('2026-10-12'), data);
  yearClick(h, 'next');
  assert.equal(h.panels[0].dataset.moneyMotion, 'still');
  assert.equal(h.panels[1].dataset.moneyMotion, 'running');
  assert.equal(h.panels[2].dataset.moneyMotion, 'still');
  assert.equal(h.panels[3].dataset.moneyMotion, 'still');
  const shrinking = h.panels[1].children['money-total'].textContent;
  h.advance(model.DAY_MS);
  assert.equal(h.panels[0].children['money-total'].textContent, model.formatNumber(data.fiat[0].latest.amount, 'en-US'));
  assert.notEqual(h.panels[1].children['money-total'].textContent, shrinking);
  assert.equal(h.panels[2].children.status.textContent, supply.scenarioUnavailable);
  assert.equal(h.panels[3].children.status.textContent, supply.scenarioUnavailable);
});

test('unavailable future denominators and exhausted assets show dashes rather than recorded shares', () => {
  const data = structuredClone(snapshot); data.population.scenarioPoints = data.population.points;
  const h = harness(false, Date.parse('2026-10-12'), data);
  yearClick(h, 'next'); yearClick(h, 'next');
  assert.equal(h.controls.population.textContent, '—');
  assert.equal(h.controls['btc-share'].textContent, '—');
  assert.ok(h.shares.every(share => share.textContent === '—'));
  assert.equal(h.controls['population-status'].textContent, supply.scenarioUnavailable);
  const shrinking = structuredClone(snapshot); shrinking.fiat[0].previousYear.amount *= 100;
  const other = harness(false, Date.parse('2026-10-12'), shrinking);
  yearClick(other, 'next');
  assert.equal(other.panels[0].children['money-total'].textContent, '—');
  assert.equal(other.shares[0].textContent, '—');
  assert.equal(other.panels[0].children.status.textContent, supply.scenarioUnavailable);
  assert.notEqual(other.controls['btc-share'].textContent, '—');
});

test('default pair is USD; all five fiats switch both panel and per-person selection', () => {
  const h = harness(), bitcoin = h.controls['btc-share'].textContent;
  assert.equal(h.controls['static-asset-heading'].hidden, true);
  assert.equal(h.panels[0].attributes['data-selected'], 'true');
  assert.equal(h.shareCards[0].attributes['data-selected'], 'true');
  assert.equal(h.controls['asset-picker'].parentElement, h.panels[0]);
  assert.equal(h.controls['asset-picker'].hidden, false);
  assert.equal(h.options.length, 5);
  for (const id of ['usd', 'eur', 'jpy', 'cny', 'gbp']) {
    selectAsset(h, id);
    h.panels.forEach((panel, index) => {
      assert.equal(panel.attributes['data-selected'], String(panel.id === id));
      assert.equal(h.shareCards[index].attributes['data-selected'], String(panel.id === id));
    });
    const selectedPanel = h.panels.find(panel => panel.id === id);
    assert.equal(h.controls['asset-picker'].parentElement, selectedPanel);
    assert.equal(h.document.activeElement, h.controls['asset-trigger']);
    assert.equal(h.controls['asset-menu'].open, false);
    h.options.forEach(option => assert.equal(option.attributes['aria-pressed'], String(option.dataset.assetOption === id)));
    assert.equal(h.controls['picker-name'].textContent, currencies[id as keyof typeof currencies].name);
    assert.equal(h.controls['btc-share'].textContent, bitcoin);
  }
  h.options[0].dataset.assetOption = 'chf';
  h.options[0].dispatchEvent(new Event('click'));
  assert.equal(h.controls['picker-name'].textContent, currencies.gbp.name);
});

test('asset menu supports arrows, endpoints, first letters, selection and Escape', () => {
  const h = harness(), trigger = h.controls['asset-trigger'], menu = h.controls['asset-menu'];
  trigger.focus(); h.key('ArrowDown');
  assert.equal(menu.open, true);
  assert.equal(trigger.attributes['aria-expanded'], 'true');
  assert.equal(h.document.activeElement, h.options[0]);
  h.key('Home'); assert.equal(h.document.activeElement, h.options[0]);
  h.key('ArrowUp'); assert.equal(h.document.activeElement, h.options[4]);
  h.key('ArrowDown'); assert.equal(h.document.activeElement, h.options[0]);
  h.key('End'); assert.equal(h.document.activeElement, h.options[4]);
  h.key('j'); assert.equal(h.document.activeElement, h.options[2]);
  h.document.activeElement!.dispatchEvent(new Event('click'));
  assert.equal(h.controls['picker-name'].textContent, currencies.jpy.name);
  assert.equal(menu.open, false);
  assert.equal(trigger.attributes['aria-expanded'], 'false');
  assert.equal(h.document.activeElement, trigger);
  h.key('ArrowDown'); h.key('Escape');
  assert.equal(menu.open, false);
  assert.equal(h.document.activeElement, trigger);
});

test('asset menu dismisses on outside click or focus without changing the selection', () => {
  const h = harness(), menu = h.controls['asset-menu'];
  menu.open = true; h.document.dispatchEvent(new Event('click'));
  assert.equal(menu.open, false);
  menu.open = true; h.controls['year-next'].focus();
  assert.equal(menu.open, false);
  assert.equal(h.document.activeElement, h.controls['year-next']);
  assert.equal(h.controls['picker-name'].textContent, currencies.usd.name);
});

test('switching selected assets preserves reduced motion and fixed Bitcoin', () => {
  const h = harness(true), bitcoin = h.controls['btc-share'].textContent;
  const frozen = values(h), people = h.controls.population.textContent;
  selectAsset(h, 'gbp');
  assert.equal(h.controls['asset-picker'].hidden, false);
  h.advance(60_000);
  assert.deepEqual(values(h), frozen);
  assert.equal(h.controls.population.textContent, people);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
  assert.equal(h.root.dataset.motion, 'still');
  selectAsset(h, 'eur');
  assert.equal(h.shareCards[1].attributes['data-selected'], 'true');
  selectAsset(h, 'gbp');
  assert.equal(h.controls['asset-picker'].hidden, false);
  h.media.matches = false; h.media.dispatchEvent(new Event('change'));
  assert.notDeepEqual(values(h), frozen);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
});

test('asset changes preserve reduced motion and independently expired projections', () => {
  const h = harness(true, Date.parse('2026-11-29'));
  selectAsset(h, 'gbp');
  assert.ok(h.panels.every(panel => panel.dataset.moneyMotion === 'still'));
  h.advance(2 * model.DAY_MS);
  assert.equal(h.panels[4].children.status.textContent, supply.stale);
  assert.equal(h.panels[4].attributes['data-selected'], 'true');
  assert.equal(h.controls['motion-status'].textContent, supply.reduced);
  assert.equal(h.root.dataset.motion, 'still');
});

test('enabling reduced motion freezes five fiats and population; Bitcoin remains fixed when motion resumes', () => {
  const h = harness();
  const initial = values(h), people = h.controls.population.textContent, bitcoin = h.controls['btc-share'].textContent;
  h.advance(10_000);
  h.panels.forEach((p, i) => { assert.notEqual(p.children['money-total'].textContent, initial[i][0]); assert.equal(p.dataset.moneyMotion, 'running'); });
  assert.notEqual(h.controls.population.textContent, people);
  h.media.matches = true; h.media.dispatchEvent(new Event('change'));
  const frozen = values(h), frozenPeople = h.controls.population.textContent;
  h.advance(60_000);
  assert.deepEqual(values(h), frozen);
  assert.equal(h.controls.population.textContent, frozenPeople);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
  assert.equal(h.root.dataset.motion, 'still');
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'still'));
  h.media.matches = false; h.media.dispatchEvent(new Event('change'));
  h.panels.forEach((p, i) => assert.notEqual(p.children['money-total'].textContent, frozen[i][0]));
  assert.notEqual(h.controls.population.textContent, frozenPeople);
  assert.equal(h.controls['btc-share'].textContent, bitcoin);
});

test('fiat shares use their own amounts and population at the same shown time', () => {
  const when = Date.parse('2026-10-10T12:00:00Z'), h = harness(false, when);
  const population = model.projectPopulation(snapshot, when).persons!;
  assert.equal(h.controls['btc-share'].textContent, model.formatNumber(model.equalShare(model.BITCOIN_MAX, population) * model.SATOSHIS_PER_BTC, 'en-US'));
  h.advance(10 * model.DAY_MS);
  const later = when + 10 * model.DAY_MS;
  h.panels.forEach((_, i) => {
    const amount = model.projectMoney(snapshot.fiat[i], later).amount!;
    assert.equal(h.shares[i].textContent, model.formatNumber(model.equalShare(amount, model.projectPopulation(snapshot, later).persons!), 'en-US'));
  });
});

test('reduced motion freezes all estimates and responds to preference changes', () => {
  const h = harness(true), initial = values(h), people = h.controls.population.textContent;
  h.advance(10_000);
  assert.deepEqual(values(h), initial);
  assert.equal(h.controls.population.textContent, people);
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'still'));
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
});

test('each series expires independently and range checks continue under reduced motion', () => {
  const data = structuredClone(snapshot);
  data.fiat[1].latest.month = '2026-09'; data.fiat[1].previousYear.month = '2025-09';
  data.fiat[1].releasedAt = '2026-10-09';
  const h = harness(true, Date.parse('2026-11-29'), data);
  h.advance(3 * model.DAY_MS);
  assert.equal(h.panels[0].dataset.moneyMotion, 'still');
  assert.equal(h.panels[0].children['money-total'].textContent, model.formatNumber(data.fiat[0].latest.amount, 'en-US'));
  assert.equal(h.panels[0].children.status.textContent, supply.stale);
  assert.equal(h.panels[1].dataset.moneyMotion, 'still');
  assert.equal(h.panels[1].children.status.textContent, '');
  assert.equal(h.root.dataset.motion, 'still');
  h.media.matches = false; h.media.dispatchEvent(new Event('change'));
  assert.equal(h.panels[1].dataset.moneyMotion, 'running');
  assert.equal(h.panels[0].dataset.moneyMotion, 'still');
});

test('outside both model ranges all motion stops and the nearest annual population is shown', () => {
  const h = harness();
  h.advance(3 * 366 * model.DAY_MS);
  assert.equal(h.root.dataset.motion, 'still');
  assert.ok(h.panels.every(p => p.dataset.moneyMotion === 'still'));
  assert.equal(h.controls.population.textContent, model.formatNumber(snapshot.population.points.at(-1)!.persons, 'en-US'));
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
