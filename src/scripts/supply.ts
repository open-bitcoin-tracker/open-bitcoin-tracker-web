import { BITCOIN_MAX, SATOSHIS_PER_BTC, equalShare, formatDate, formatNumber, interpolate, projectMoney, projectPopulation, projectGold, goldShareGrams, annualMiningRate, annualRate, type SupplySnapshot } from '../features/supply/model';
import type { SupplyCopy } from '../i18n/supply';

type ClientCopy = Pick<SupplyCopy, 'projected' | 'recorded' | 'goldProjected' | 'goldRecorded' | 'goldStale' | 'goldUnavailable' | 'paused' | 'pause' | 'resume' | 'stale' | 'reduced' | 'unavailable' | 'populationEstimate' | 'populationRecorded' | 'populationFallback' | 'populationUnavailable' | 'bitcoinShareBasis'>;
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
  const populationLabel = root.querySelector<HTMLElement>('[data-population-label]');
  const populationStatus = root.querySelector<HTMLElement>('[data-population-status]');
  const bitcoinShare = root.querySelector<HTMLElement>('[data-btc-share]');
  const bitcoinTotal = root.querySelector<HTMLElement>('[data-btc-total]');
  const bitcoinTotalUnit = root.querySelector<HTMLElement>('[data-btc-total-unit]');
  const bitcoinShareUnit = root.querySelector<HTMLElement>('[data-btc-share-unit]');
  const bitcoinSats = root.querySelector<HTMLInputElement>('[data-bitcoin-sats]');
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
  const compareAll = root.querySelector<HTMLInputElement>('[data-compare-all]');
  const comparisonControls = root.querySelector<HTMLElement>('[data-comparison-controls]');
  const comparisonAssets = [
    { id: 'gold', panel: goldPanel },
    ...panels.map(({ money, panel }) => ({ id: money.id, panel })),
  ];
  let selectedAsset = 'usd';
  const updateComparison = () => {
    root.dataset.view = compareAll?.checked ? 'all' : 'focus';
    if (compareAll?.checked && assetMenu) assetMenu.open = false;
    for (const { id, panel } of comparisonAssets) {
      const selected = String(id === selectedAsset);
      panel?.setAttribute('data-selected', selected);
    }
    const selectedPanel = comparisonAssets.find(asset => asset.id === selectedAsset)?.panel;
    if (assetPicker) {
      assetPicker.hidden = Boolean(compareAll?.checked);
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
  // One set of nodes and one clock: switching views never resets the visit's
  // Bitcoin share, pause state, model time, or any projection fallback.
  updateComparison();
  compareAll?.addEventListener('change', updateComparison);
  assetOptions.forEach(option => option.addEventListener('click', () => {
    const id = option.dataset.assetOption;
    if (!comparisonAssets.some(asset => asset.id === id)) return;
    selectedAsset = id!;
    if (assetMenu) assetMenu.open = false;
    updateComparison();
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
  if (comparisonControls) comparisonControls.hidden = false;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  let frozenAt = Date.now();
  let timer: number | undefined;
  const setText = (element: HTMLElement | null, text: string) => {
    if (element && element.textContent !== text) element.textContent = text;
  };
  // A one-time visit snapshot keeps Bitcoin's share fixed while gold, fiat and
  // population follow one shared model time. No persisted demographic clock.
  const visitPopulation = projectPopulation(snapshot, frozenAt).persons ?? snapshot.population.persons;
  const visitBitcoinShare = equalShare(BITCOIN_MAX, visitPopulation);
  const renderBitcoinUnit = () => {
    const sats = bitcoinSats?.checked ?? false;
    root.dataset.bitcoinUnit = sats ? 'sats' : 'btc';
    setText(bitcoinTotal, formatNumber(BITCOIN_MAX * (sats ? SATOSHIS_PER_BTC : 1), locale));
    // Convert the unrounded visit share; changing units never changes its basis.
    setText(bitcoinShare, formatNumber(visitBitcoinShare * (sats ? SATOSHIS_PER_BTC : 1), locale, sats ? 0 : 8));
    for (const unit of [bitcoinTotalUnit, bitcoinShareUnit]) {
      setText(unit, sats ? ' sats' : ' bitcoins');
      unit?.setAttribute('class', sats ? 'bitcoin-unit' : 'currency-name');
    }
  };
  renderBitcoinUnit();
  bitcoinSats?.addEventListener('change', renderBitcoinUnit);
  setText(bitcoinBasis, interpolate(copy.bitcoinShareBasis, { population: formatNumber(visitPopulation, locale) }));
  const render = () => {
    const now = Date.now();
    // Expiry checks use wall time even while the displayed model time is frozen.
    const shownAt = paused || reduce.matches ? frozenAt : now;
    const currentPopulation = projectPopulation(snapshot, now);
    const shownPopulation = currentPopulation.state === 'estimated' ? projectPopulation(snapshot, shownAt) : currentPopulation;
    const people = shownPopulation.persons ?? snapshot.population.persons;
    setText(populationTotal, formatNumber(people, locale));
    setText(populationLabel, shownPopulation.state === 'estimated' ? copy.populationEstimate : copy.populationRecorded);
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
