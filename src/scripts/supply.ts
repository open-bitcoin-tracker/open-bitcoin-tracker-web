import { createGuideDrawer } from '../lib/guide-drawer';
import { createDisclosureMenu } from '../lib/disclosure-menu';
import { BITCOIN_MAX, SATOSHIS_PER_BTC, equalShare, formatDate, formatNumber, interpolate, projectMoney, projectPopulation, annualRate, MAX_SCENARIO_YEARS, scenarioDate, projectScenarioPopulation, scenarioMoney, type SupplySnapshot } from '../features/supply/model';
import type { SupplyCopy } from '../i18n/supply';

type ClientCopy = Pick<SupplyCopy, 'projected' | 'recorded' | 'stale' | 'reduced' | 'unavailable' | 'populationFallback' | 'populationUnavailable' | 'scenarioNote' | 'scenarioUnavailable' | 'scenarioProjected'>;
const root = document.querySelector<HTMLElement>('[data-supply]');
const json = document.getElementById('supply-data');
if (root && json) {
  const { snapshot, locale, copy } = JSON.parse(json.textContent ?? '{}') as { snapshot: SupplySnapshot; locale: string; copy: ClientCopy };
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
  const comparisonAssets = panels.map(({ money, panel }) => ({
    id: money.id, panel, shareCard: root.querySelector<HTMLElement>(`[data-share-asset="${money.id}"]`),
  }));
  let selectedAsset = 'usd';
  const updateSelectedAsset = () => {
    for (const currency of methodCurrencies) currency.hidden = currency.dataset.methodCurrency !== selectedAsset;
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
  const assetDisclosure = assetMenu ? createDisclosureMenu(assetMenu) : undefined;
  const closeAssetMenu = () => assetDisclosure?.close();
  // Move the existing content instead of duplicating its live status elements.
  // The native disclosure remains usable when JavaScript or dialog support is absent.
  const methodTrigger = root.querySelector<HTMLButtonElement>('[data-method-trigger]');
  const methodDialog = root.querySelector<HTMLDialogElement>('[data-method-dialog]');
  const methodCloses = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-method-close]'));
  const methodBody = root.querySelector<HTMLElement>('[data-method-body]');
  const methodContent = root.querySelector<HTMLElement>('[data-method-content]');
  const methodFallback = root.querySelector<HTMLDetailsElement>('[data-method-fallback]');
  const methodOverview = root.querySelector<HTMLElement>('[data-method-overview]');
  const methodOverviewBody = root.querySelector<HTMLElement>('[data-method-overview-body]');
  const methodTitle = root.querySelector<HTMLElement>('[data-method-title]');
  const methodDetail = root.querySelector<HTMLElement>('[data-method-detail]');
  const methodDetailTitle = root.querySelector<HTMLElement>('[data-method-detail-title]');
  const methodBack = root.querySelector<HTMLButtonElement>('[data-method-back]');
  const sectionTriggers = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-method-section-trigger]'));
  const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-method-section]'));
  if (methodTrigger && methodDialog && methodBody && methodContent && methodFallback && methodOverview && methodDetail && methodDetailTitle && typeof methodDialog.showModal === 'function') {
    methodBody.append(methodContent);
    methodFallback.hidden = true;
    methodTrigger.hidden = false;
    const drawer = createGuideDrawer({
      dialog: methodDialog,
      overview: methodOverview,
      detail: methodDetail,
      heading: methodTitle,
      detailHeading: methodDetailTitle,
      detailBody: methodBody,
      overviewBody: methodOverviewBody,
      back: methodBack,
      closeButtons: methodCloses,
      trigger: methodTrigger,
      sections: sectionTriggers.map(trigger => ({ trigger, select() {
        for (const section of sections) section.hidden = section.dataset.methodSection !== trigger.dataset.methodSectionTrigger;
        methodDetailTitle.textContent = trigger.textContent?.trim() ?? '';
      } })),
    });
    methodTrigger.addEventListener('click', () => {
      updateSelectedAsset();
      closeAssetMenu();
      drawer.open();
    });
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
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
  const renderScenario = (at: number) => {
    const population = projectScenarioPopulation(snapshot, at);
    const people = population.persons;
    const motion = !reduce.matches && !document.hidden ? 'running' : 'still';
    let canMove = population.state === 'estimated' && population.rate !== 0;
    const date = formatDate(new Date(at).toISOString(), locale);
    setText(scenarioNote, interpolate(copy.scenarioNote, { date }));
    setText(populationTotal, people === null ? '—' : formatNumber(people, locale));
    setText(populationStatus, people === null ? copy.scenarioUnavailable : '');
    shownBitcoinShare = people === null ? NaN : equalShare(BITCOIN_MAX, people);
    renderBitcoin();
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
    setText(motionStatus, reduce.matches ? copy.reduced : '');
  };
  const render = () => {
    const now = Date.now();
    const shownAt = reduce.matches ? frozenAt : now;
    root.dataset.mode = selectedYears > 0 ? 'scenario' : 'today';
    if (previousYear) previousYear.disabled = selectedYears === 0;
    if (nextYear) nextYear.disabled = selectedYears === MAX_SCENARIO_YEARS;
    setText(selectedYear, String(new Date(selectedYears > 0 ? shownAt : now).getUTCFullYear() + selectedYears));
    if (selectedYears > 0) {
      renderScenario(scenarioDate(shownAt, selectedYears));
      return;
    }
    setText(scenarioNote, '');
    shownBitcoinShare = visitBitcoinShare;
    renderBitcoin();
    // Expiry checks use wall time even while the displayed model time is frozen.
    const currentPopulation = projectPopulation(snapshot, now);
    const shownPopulation = currentPopulation.state === 'estimated' ? projectPopulation(snapshot, shownAt) : currentPopulation;
    const people = shownPopulation.persons ?? snapshot.population.persons;
    setText(populationTotal, formatNumber(people, locale));
    setText(populationStatus, shownPopulation.state === 'snapshot'
      ? interpolate(copy.populationFallback, { date: formatDate(shownPopulation.date!, locale) })
      : shownPopulation.state === 'unavailable' ? copy.populationUnavailable : '');
    setText(motionStatus, reduce.matches ? copy.reduced : '');
    const motion = !reduce.matches && !document.hidden ? 'running' : 'still';
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
  };
  const schedule = () => {
    window.clearInterval(timer);
    render();
    // Quiet counters, no animation frame loop; continue bounded-range checks.
    if (!document.hidden) timer = window.setInterval(render, reduce.matches ? 30_000 : 100);
  };
  const changeYear = (years: number) => {
    if (years < 0 || years > MAX_SCENARIO_YEARS) return;
    selectedYears = years;
    schedule();
  };
  if (yearControls) yearControls.hidden = false;
  previousYear?.addEventListener('click', () => changeYear(selectedYears - 1));
  nextYear?.addEventListener('click', () => changeYear(selectedYears + 1));
  reduce.addEventListener('change', () => { frozenAt = Date.now(); schedule(); });
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', () => { window.clearInterval(timer); });
  window.addEventListener('pageshow', schedule);
  schedule();
}
