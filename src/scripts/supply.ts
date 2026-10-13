import { BITCOIN_MAX, SATOSHIS_PER_BTC, equalShare, formatDate, formatNumber, interpolate, projectMoney, projectPopulation, annualRate, MAX_SCENARIO_YEARS, scenarioDate, projectScenarioPopulation, scenarioMoney, type SupplySnapshot } from '../features/supply/model';
import type { SupplyCopy } from '../i18n/supply';

type ClientCopy = Pick<SupplyCopy, 'projected' | 'recorded' | 'paused' | 'pause' | 'resume' | 'stale' | 'reduced' | 'unavailable' | 'populationFallback' | 'populationUnavailable' | 'bitcoinShareBasis' | 'todayNote' | 'scenarioNote' | 'scenarioUnavailable' | 'scenarioProjected' | 'bitcoinScenarioBasis'>;
const root = document.querySelector<HTMLElement>('[data-supply]');
const json = document.getElementById('supply-data');
if (root && json) {
  const { snapshot, locale, copy } = JSON.parse(json.textContent ?? '{}') as { snapshot: Pick<SupplySnapshot, 'checkedAt' | 'population' | 'fiat'>; locale: string; copy: ClientCopy };
  const panels = snapshot.fiat.map((money) => {
    const panel = root.querySelector<HTMLElement>(`[data-currency="${money.id}"]`);
    return { money, panel,
      total: panel?.querySelector<HTMLElement>('[data-money-total]') ?? null,
      share: root.querySelector<HTMLElement>(`[data-money-share="${money.id}"]`),
      label: root.querySelector<HTMLElement>(`[data-total-label="${money.id}"]`),
      status: root.querySelector<HTMLElement>(`[data-projection-status="${money.id}"]`),
    };
  });
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
  const pickerName = root.querySelector<HTMLElement>('[data-picker-name]');
  const yearControls = root.querySelector<HTMLElement>('[data-year-controls]');
  const previousYear = root.querySelector<HTMLButtonElement>('[data-year-previous]');
  const nextYear = root.querySelector<HTMLButtonElement>('[data-year-next]');
  const selectedYear = root.querySelector<HTMLElement>('[data-selected-year]');
  const scenarioNote = root.querySelector<HTMLElement>('[data-scenario-note]');
  root.querySelectorAll<HTMLElement>('[data-sats-help]').forEach(help => {
    const label = help.querySelector<HTMLButtonElement>('.sats-label');
    const tooltip = help.querySelector<HTMLElement>('.sats-tooltip');
    const position = () => {
      if (!label || !tooltip) return;
      const bounds = label.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const desiredWidth = Math.min(15 * parseFloat(getComputedStyle(document.documentElement).fontSize), viewportWidth - 32);
      const rightRoom = viewportWidth - bounds.right - 24;
      const leftRoom = bounds.left - 24;
      const onRight = rightRoom >= desiredWidth || rightRoom >= leftRoom;
      const width = Math.max(1, Math.min(desiredWidth, onRight ? rightRoom : leftRoom));
      tooltip.dataset.positioned = '';
      tooltip.style.width = `${width}px`;
      tooltip.style.left = `${onRight ? bounds.right + 8 : bounds.left - 8 - width}px`;
      const height = tooltip.getBoundingClientRect().height;
      tooltip.style.top = `${Math.max(16, Math.min(bounds.top + (bounds.height - height) / 2, window.innerHeight - height - 16))}px`;
    };
    const reset = () => { help.removeAttribute('data-tooltip-dismissed'); position(); };
    help.addEventListener('pointerenter', reset);
    help.addEventListener('focusin', reset);
    help.addEventListener('keydown', event => {
      if (event.key === 'Escape') help.setAttribute('data-tooltip-dismissed', '');
    });
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, { capture: true, passive: true });
  });
  const methodCurrencies = Array.from(root.querySelectorAll<HTMLElement>('[data-method-currency]'));
  const methodComparison = root.querySelector<HTMLElement>('[data-method-comparison]');
  const comparisonAssets = panels.map(({ money, panel }) => ({
    id: money.id, panel, shareCard: root.querySelector<HTMLElement>(`[data-share-asset="${money.id}"]`),
  }));
  let selectedAsset = 'usd';
  const updateSelectedAsset = () => {
    for (const currency of methodCurrencies) currency.hidden = currency.dataset.methodCurrency !== selectedAsset;
    const selectedName = assetOptions.find(option => option.dataset.assetOption === selectedAsset)?.textContent;
    if (methodComparison && selectedName) methodComparison.textContent = `Bitcoin vs ${selectedName}`;
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
  // Move the existing content instead of duplicating its live status elements.
  // The native disclosure remains usable when JavaScript or dialog support is absent.
  const methodTrigger = root.querySelector<HTMLButtonElement>('[data-method-trigger]');
  const methodDialog = root.querySelector<HTMLDialogElement>('[data-method-dialog]');
  const methodClose = root.querySelector<HTMLButtonElement>('[data-method-close]');
  const methodBody = root.querySelector<HTMLElement>('[data-method-body]');
  const methodContent = root.querySelector<HTMLElement>('[data-method-content]');
  const methodFallback = root.querySelector<HTMLDetailsElement>('[data-method-fallback]');
  if (methodTrigger && methodDialog && methodClose && methodBody && methodContent && methodFallback && typeof methodDialog.showModal === 'function') {
    methodBody.append(methodContent);
    methodFallback.hidden = true;
    methodTrigger.hidden = false;
    methodTrigger.addEventListener('click', () => {
      updateSelectedAsset();
      closeAssetMenu();
      if (!methodDialog.open) methodDialog.showModal();
      methodBody.scrollTop = 0;
    });
    methodClose.addEventListener('click', () => methodDialog.close());
    methodDialog.addEventListener('click', (event) => {
      if (event.target === methodDialog) methodDialog.close();
    });
    methodDialog.addEventListener('close', () => methodTrigger.focus({ preventScroll: true }));
    methodDialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(methodDialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    });
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  const visitAt = Date.now();
  let frozenAt = visitAt;
  let selectedYears = 0;
  let timer: number | undefined;
  const setText = (element: HTMLElement | null, text: string) => {
    if (element && element.textContent !== text) element.textContent = text;
  };
  // A one-time visit snapshot keeps Bitcoin's share fixed while fiat and
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
    setText(selectedYear, String(new Date(selectedYears > 0 ? shownAt : now).getUTCFullYear() + selectedYears));
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
