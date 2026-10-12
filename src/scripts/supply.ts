import { BITCOIN_MAX, SATOSHIS_PER_BTC, equalShare, formatDate, formatNumber, interpolate, projectMoney, projectPopulation, projectGold, goldShareGrams, annualMiningRate, annualRate, MAX_SCENARIO_YEARS, scenarioDate, projectScenarioPopulation, scenarioMoney, scenarioGold, type SupplySnapshot } from '../features/supply/model';
import type { SupplyCopy } from '../i18n/supply';

type ClientCopy = Pick<SupplyCopy, 'projected' | 'recorded' | 'goldProjected' | 'goldRecorded' | 'goldStale' | 'goldUnavailable' | 'paused' | 'pause' | 'resume' | 'stale' | 'reduced' | 'unavailable' | 'populationFallback' | 'populationUnavailable' | 'bitcoinShareBasis' | 'todayYear' | 'scenarioYear' | 'todayNote' | 'scenarioNote' | 'scenarioUnavailable' | 'scenarioProjected' | 'goldScenario' | 'bitcoinScenarioBasis'>;
const root = document.querySelector<HTMLElement>('[data-supply]');
const json = document.getElementById('supply-data');
if (root && json) {
  const { snapshot, locale, copy } = JSON.parse(json.textContent ?? '{}') as { snapshot: SupplySnapshot; locale: string; copy: ClientCopy };
  const panels = snapshot.fiat.map((money) => {
    const panel = root.querySelector<HTMLElement>(`[data-currency="${money.id}"]`);
    return { money, panel,
      total: panel?.querySelector<HTMLElement>('[data-money-total]') ?? null,
      share: root.querySelector<HTMLElement>(`[data-money-share="${money.id}"]`),
      label: panel?.querySelector<HTMLElement>('[data-total-label]') ?? null,
      status: root.querySelector<HTMLElement>(`[data-projection-status="${money.id}"]`),
    };
  });
  const goldPanel = root.querySelector<HTMLElement>('[data-gold]');
  const goldTotal = root.querySelector<HTMLElement>('[data-gold-total]');
  const goldShare = root.querySelector<HTMLElement>('[data-gold-share]');
  const goldLabel = root.querySelector<HTMLElement>('[data-gold-label]');
  const goldStatus = root.querySelector<HTMLElement>('[data-gold-status]');
  const motionStatus = root.querySelector<HTMLElement>('[data-motion-status]');
  const populationTotal = root.querySelector<HTMLElement>('[data-population]');
  const populationStatus = root.querySelector<HTMLElement>('[data-population-status]');
  const bitcoinShare = root.querySelector<HTMLElement>('[data-btc-share]');
  const bitcoinTotal = root.querySelector<HTMLElement>('[data-btc-total]');
  const bitcoinBasis = root.querySelector<HTMLElement>('[data-btc-basis]');
  const button = root.querySelector<HTMLButtonElement>('[data-pause]');
  const buttonLabel = root.querySelector<HTMLElement>('[data-pause-label]');
  const assetTrigger = root.querySelector<HTMLElement>('[data-asset-trigger]');
  const assetMenu = root.querySelector<HTMLDetailsElement>('[data-asset-menu]');
  const assetOptions = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-asset-option]'));
  const assetPicker = root.querySelector<HTMLElement>('[data-asset-picker]');
  const pickerGold = root.querySelector<HTMLElement>('[data-picker-gold]');
  const pickerSymbol = root.querySelector<HTMLElement>('[data-picker-symbol]');
  const pickerName = root.querySelector<HTMLElement>('[data-picker-name]');
  const yearControls = root.querySelector<HTMLElement>('[data-year-controls]');
  const previousYear = root.querySelector<HTMLButtonElement>('[data-year-previous]');
  const nextYear = root.querySelector<HTMLButtonElement>('[data-year-next]');
  const resetYear = root.querySelector<HTMLButtonElement>('[data-year-reset]');
  const selectedYear = root.querySelector<HTMLElement>('[data-selected-year]');
  const scenarioNote = root.querySelector<HTMLElement>('[data-scenario-note]');
  const comparisonAssets = [
    { id: 'gold', panel: goldPanel },
    ...panels.map(({ money, panel }) => ({ id: money.id, panel })),
  ].map(asset => ({ ...asset, shareCard: root.querySelector<HTMLElement>(`[data-share-asset="${asset.id}"]`) }));
  let selectedAsset = 'usd';
  const updateSelectedAsset = () => {
    for (const { id, panel, shareCard } of comparisonAssets) {
      const selected = String(id === selectedAsset);
      panel?.setAttribute('data-selected', selected);
      shareCard?.setAttribute('data-selected', selected);
    }
    const selectedPanel = comparisonAssets.find(asset => asset.id === selectedAsset)?.panel;
    if (assetPicker) {
      assetPicker.hidden = false;
      const option = assetOptions.find(option => option.dataset.assetOption === selectedAsset);
      if (option?.textContent) {
        assetPicker.setAttribute('aria-label', option.textContent);
        if (pickerName) pickerName.textContent = option.textContent;
      }
      if (pickerGold) pickerGold.hidden = selectedAsset !== 'gold';
      if (pickerSymbol) {
        pickerSymbol.hidden = selectedAsset === 'gold';
        pickerSymbol.textContent = option?.dataset.symbol ?? '';
      }
      if (selectedPanel && assetPicker.parentElement !== selectedPanel) {
        const focused = document.activeElement === assetTrigger;
        selectedPanel.prepend(assetPicker);
        if (focused) assetTrigger?.focus({ preventScroll: true });
      }
    }
    for (const option of assetOptions) option.setAttribute('aria-pressed', String(option.dataset.assetOption === selectedAsset));
  };
  // Asset changes preserve the visit's Bitcoin share and the shared clock.
  updateSelectedAsset();
  const staticHeading = root.querySelector<HTMLElement>('[data-static-asset-heading]');
  if (staticHeading) staticHeading.hidden = true;
  assetOptions.forEach(option => option.addEventListener('click', () => {
    const id = option.dataset.assetOption;
    if (!comparisonAssets.some(asset => asset.id === id)) return;
    selectedAsset = id!;
    if (assetMenu) assetMenu.open = false;
    updateSelectedAsset();
    assetTrigger?.focus({ preventScroll: true });
  }));
  // Match the language switcher's native disclosure and dismissal behavior.
  // Option buttons retain ordinary Tab/Enter/Space controls; arrows, endpoints
  // and first-letter navigation also work without changing the model clock.
  const closeAssetMenu = (restoreFocus = false) => {
    if (assetMenu) assetMenu.open = false;
    assetTrigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) assetTrigger?.focus({ preventScroll: true });
  };
  assetMenu?.addEventListener('toggle', () => assetTrigger?.setAttribute('aria-expanded', String(assetMenu.open)));
  assetMenu?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && assetMenu.open) {
      event.preventDefault(); event.stopPropagation(); closeAssetMenu(true); return;
    }
    const active = assetOptions.findIndex(option => option === document.activeElement);
    const selected = assetOptions.findIndex(option => option.dataset.assetOption === selectedAsset);
    let next = -1;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = assetOptions.length - 1;
    else if (event.key === 'ArrowDown') next = active < 0 ? selected : (active + 1) % assetOptions.length;
    else if (event.key === 'ArrowUp') next = active < 0 ? selected : (active + assetOptions.length - 1) % assetOptions.length;
    else if (event.key.length === 1 && event.key !== ' ' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      for (let step = 1; step <= assetOptions.length; step++) {
        const index = (active + step) % assetOptions.length;
        if (assetOptions[index].textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase())) { next = index; break; }
      }
    }
    if (next >= 0) {
      event.preventDefault(); assetMenu.open = true;
      assetTrigger?.setAttribute('aria-expanded', 'true');
      assetOptions[next]?.focus({ preventScroll: true });
    }
  });
  document.addEventListener('click', (event) => { if (assetMenu?.open && !assetMenu.contains(event.target as Node)) closeAssetMenu(); });
  document.addEventListener('focusin', () => { if (assetMenu?.open && !assetMenu.contains(document.activeElement)) closeAssetMenu(); });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  const visitAt = Date.now();
  let frozenAt = visitAt;
  let selectedYears = 0;
  let timer: number | undefined;
  const setText = (element: HTMLElement | null, text: string) => {
    if (element && element.textContent !== text) element.textContent = text;
  };
  // A one-time visit snapshot keeps Bitcoin's share fixed while gold, fiat and
  // population follow one shared model time. No persisted demographic clock.
  const visitPopulation = projectPopulation(snapshot, frozenAt).persons ?? snapshot.population.persons;
  const visitBitcoinShare = equalShare(BITCOIN_MAX, visitPopulation);
  let shownBitcoinShare = visitBitcoinShare;
  const renderBitcoin = () => {
    setText(bitcoinTotal, formatNumber(BITCOIN_MAX * SATOSHIS_PER_BTC, locale));
    // Convert the unrounded active share before rounding to whole satoshis.
    setText(bitcoinShare, Number.isFinite(shownBitcoinShare) ? formatNumber(shownBitcoinShare * SATOSHIS_PER_BTC, locale) : '—');
  };
  renderBitcoin();
  setText(bitcoinBasis, interpolate(copy.bitcoinShareBasis, { population: formatNumber(visitPopulation, locale) }));
  const renderScenario = (at: number) => {
    const population = projectScenarioPopulation(snapshot, at);
    const people = population.persons;
    const motion = !reduce.matches && !document.hidden ? paused ? 'paused' : 'running' : 'still';
    let canMove = population.state === 'estimated' && population.rate !== 0;
    const date = formatDate(new Date(at).toISOString(), locale);
    setText(scenarioNote, interpolate(copy.scenarioNote, { date }));
    setText(populationTotal, people === null ? '—' : formatNumber(people, locale));
    setText(populationStatus, people === null ? copy.scenarioUnavailable : '');
    shownBitcoinShare = people === null ? NaN : equalShare(BITCOIN_MAX, people);
    renderBitcoin();
    setText(bitcoinBasis, people === null ? copy.scenarioUnavailable : interpolate(copy.bitcoinScenarioBasis, { date, population: formatNumber(people, locale) }));
    const tonnes = scenarioGold(snapshot.gold, at);
    setText(goldTotal, tonnes === null ? '—' : formatNumber(tonnes, locale, 3));
    setText(goldShare, tonnes === null || people === null ? '—' : formatNumber(goldShareGrams(tonnes, people), locale, 2));
    setText(goldLabel, copy.goldScenario);
    setText(goldStatus, tonnes === null ? copy.scenarioUnavailable : '');
    const goldCanMove = tonnes !== null && annualMiningRate(snapshot.gold) > 0;
    canMove ||= goldCanMove;
    if (goldPanel) goldPanel.dataset.goldMotion = goldCanMove ? motion : 'still';
    for (const { money, panel, total, share, label, status } of panels) {
      const amount = scenarioMoney(money, at);
      setText(total, amount === null ? '—' : formatNumber(amount, locale));
      setText(share, amount === null || people === null ? '—' : formatNumber(equalShare(amount, people), locale));
      setText(label, interpolate(copy.scenarioProjected, { aggregate: money.aggregate }));
      setText(status, amount === null ? copy.scenarioUnavailable : '');
      const moneyCanMove = amount !== null && annualRate(money) !== 0;
      canMove ||= moneyCanMove;
      if (panel) panel.dataset.moneyMotion = moneyCanMove ? motion : 'still';
    }
    root.dataset.motion = canMove ? motion : 'still';
    setText(motionStatus, reduce.matches ? copy.reduced : paused ? copy.paused : '');
    if (button) {
      button.hidden = !canMove || reduce.matches;
      button.setAttribute('aria-pressed', String(paused));
    }
    setText(buttonLabel, paused ? copy.resume : copy.pause);
  };
  const render = () => {
    const now = Date.now();
    const shownAt = paused || reduce.matches ? frozenAt : now;
    root.dataset.mode = selectedYears > 0 ? 'scenario' : 'today';
    if (previousYear) previousYear.disabled = selectedYears === 0;
    if (nextYear) nextYear.disabled = selectedYears === MAX_SCENARIO_YEARS;
    if (resetYear) resetYear.disabled = selectedYears === 0;
    setText(selectedYear, interpolate(selectedYears > 0 ? copy.scenarioYear : copy.todayYear, { year: String(new Date(selectedYears > 0 ? shownAt : now).getUTCFullYear() + selectedYears) }));
    if (selectedYears > 0) {
      renderScenario(scenarioDate(shownAt, selectedYears));
      return;
    }
    setText(scenarioNote, copy.todayNote);
    shownBitcoinShare = visitBitcoinShare;
    renderBitcoin();
    setText(bitcoinBasis, interpolate(copy.bitcoinShareBasis, { population: formatNumber(visitPopulation, locale) }));
    // Expiry checks use wall time even while the displayed model time is frozen.
    const currentPopulation = projectPopulation(snapshot, now);
    const shownPopulation = currentPopulation.state === 'estimated' ? projectPopulation(snapshot, shownAt) : currentPopulation;
    const people = shownPopulation.persons ?? snapshot.population.persons;
    setText(populationTotal, formatNumber(people, locale));
    setText(populationStatus, shownPopulation.state === 'snapshot'
      ? interpolate(copy.populationFallback, { date: formatDate(shownPopulation.date!, locale) })
      : shownPopulation.state === 'unavailable' ? copy.populationUnavailable : '');
    setText(motionStatus, reduce.matches ? copy.reduced : paused ? copy.paused : '');
    const motion = !reduce.matches && !document.hidden ? paused ? 'paused' : 'running' : 'still';
    let canMove = currentPopulation.state === 'estimated' && currentPopulation.rate !== 0;
    const currentGold = projectGold(snapshot.gold, now);
    const shownGold = currentGold.state === 'projected' ? projectGold(snapshot.gold, shownAt) : currentGold;
    const recordedGold = snapshot.gold?.stock?.tonnes;
    const tonnes = shownGold.tonnes ?? (Number.isFinite(recordedGold) && recordedGold > 0 ? recordedGold : null);
    setText(goldTotal, tonnes === null ? '—' : formatNumber(tonnes, locale, shownGold.state === 'projected' ? 3 : 0));
    setText(goldShare, tonnes === null ? '—' : formatNumber(goldShareGrams(tonnes, people), locale, 2));
    setText(goldLabel, shownGold.state === 'projected' ? copy.goldProjected : copy.goldRecorded);
    setText(goldStatus, currentGold.state === 'stale' ? copy.goldStale : currentGold.state === 'unavailable' ? copy.goldUnavailable : '');
    const goldCanMove = currentGold.state === 'projected' && annualMiningRate(snapshot.gold) > 0;
    canMove ||= goldCanMove;
    if (goldPanel) goldPanel.dataset.goldMotion = goldCanMove ? motion : 'still';
    for (const { money, panel, total, share, label, status } of panels) {
      const current = projectMoney(money, now);
      const shown = current.state === 'projected' ? projectMoney(money, shownAt) : current;
      const projected = shown.state === 'projected';
      const amount = shown.amount ?? money.latest.amount;
      setText(total, formatNumber(amount, locale));
      setText(share, formatNumber(equalShare(amount, people), locale));
      setText(label, interpolate(projected ? copy.projected : copy.recorded, { aggregate: money.aggregate }));
      setText(status, current.state === 'stale' ? copy.stale : current.state === 'unavailable' ? copy.unavailable : '');
      const moneyCanMove = projected && annualRate(money) !== 0;
      canMove ||= moneyCanMove;
      // Only this currency's model controls its bills. Population and another
      // currency cannot restart a flat, expired or unavailable series.
      if (panel) panel.dataset.moneyMotion = moneyCanMove ? motion : 'still';
    }
    root.dataset.motion = canMove ? motion : 'still';
    if (button) {
      button.hidden = !canMove || reduce.matches;
      button.setAttribute('aria-pressed', String(paused));
    }
    setText(buttonLabel, paused ? copy.resume : copy.pause);
  };
  const schedule = () => {
    window.clearInterval(timer);
    render();
    // Quiet counters, no animation frame loop; continue bounded-range checks.
    if (!document.hidden) timer = window.setInterval(render, paused || reduce.matches || button?.hidden ? 30_000 : 100);
  };
  const changeYear = (years: number) => {
    if (years < 0 || years > MAX_SCENARIO_YEARS) return;
    selectedYears = years;
    schedule();
  };
  if (yearControls) yearControls.hidden = false;
  previousYear?.addEventListener('click', () => changeYear(selectedYears - 1));
  nextYear?.addEventListener('click', () => changeYear(selectedYears + 1));
  resetYear?.addEventListener('click', () => changeYear(0));
  button?.addEventListener('click', () => {
    paused = !paused;
    if (paused) frozenAt = Date.now();
    schedule();
  });
  reduce.addEventListener('change', () => { frozenAt = Date.now(); schedule(); });
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', () => { window.clearInterval(timer); });
  window.addEventListener('pageshow', schedule);
  schedule();
}
