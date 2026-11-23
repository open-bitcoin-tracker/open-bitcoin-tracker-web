import { DAY_MS, chartPaths, chartPositions, chartViewport, extremeIndices, mergeHistory, nearestHistoryIndex, parseHistory, visibleHistory, type ChartScale, type HistoryPoint } from '../lib/bitcoin-chart';
import { ChartMotion } from '../lib/bitcoin-chart-motion';
import { createPriceChangeFormatter } from '../lib/bitcoin-price-change';
import type { TrackerCopy } from '../i18n/tracker';
import type { RangeCopy } from '../i18n/ranges';
import { candleWindow, historyForRange, parseCandles, stepRange, type BitcoinRange } from '../lib/bitcoin-range';
import { createRangePill } from './bitcoin-range-pill';
import { readRangePreferences, saveRangePreferences } from '../lib/bitcoin-range-preferences';
import { CurrencyRates, isCurrency, type Currency } from '../lib/bitcoin-currency';
import { readDisplayPreferences, saveDisplayPreferences, subscribeCurrencyPreference } from '../lib/bitcoin-display-preferences';
import type { ChartSettingsCopy } from '../i18n/chart-settings';
import { subscribeBitcoinPrice, type PriceFeedState } from '../lib/bitcoin-live-price';
import { createCurrencyPicker } from '../lib/currency-picker';
import { createPriceTabTitle } from '../lib/price-tab-title';
import { createChartFullscreenControls } from '../lib/chart-fullscreen-controls';
import { createRollingNumber, type RollingNumber } from '../lib/rolling-number';

const root = document.querySelector<HTMLElement>('[data-bitcoin-tracker]');
if (root) startTracker(root);

function startTracker(root: HTMLElement) {
  const t: TrackerCopy = JSON.parse(root.dataset.copy!);
  const r: RangeCopy = JSON.parse(root.dataset.rangeCopy!);
  const settingsCopy: ChartSettingsCopy = JSON.parse(root.dataset.settingsCopy!);
  const locale = root.dataset.locale || 'en';
  const priceEl = root.querySelector<HTMLElement>('[data-price]')!;
  const priceChangeEl = root.querySelector<HTMLElement>('[data-price-change]')!;
  // The price button sizes both the price and the currency code beside it from the character count.
  const priceSizer = root.querySelector<HTMLElement>('[data-price-currency-picker] [data-currency-trigger]') ?? priceEl;
  // Rolling digits draw over the real price text, which stays for layout, screen readers, and the tab title.
  const priceRoll = createRollingNumber(root.querySelector<HTMLElement>('[data-price-roll]'));
  if (priceRoll) priceSizer.setAttribute('data-price-rolling', '');
  let lastLive: { value: number; currency: Currency } | undefined;
  let showingLive = false;
  let rollDirection = 1;
  const display = readDisplayPreferences();
  let currency: Currency = display.currency;
  let formatPriceChange = createPriceChangeFormatter(locale, currency);
  const chart = root.querySelector<SVGSVGElement>('[data-chart]')!;
  const line = root.querySelector<SVGPathElement>('[data-chart-line]')!;
  const area = root.querySelector<SVGPathElement>('[data-chart-area]')!;
  const fillGradient = root.querySelector<SVGLinearGradientElement>('[data-chart-fill-gradient]')!;
  const revealRect = root.querySelector<SVGRectElement>('[data-chart-reveal]')!;
  const extremesEl = root.querySelector<HTMLElement>('[data-chart-extremes]')!;
  const extremeEls = { high: root.querySelector<HTMLElement>('[data-chart-extreme="high"]')!, low: root.querySelector<HTMLElement>('[data-chart-extreme="low"]')! };
  const highLowToggle = root.querySelector<HTMLButtonElement>('[data-high-low-toggle]')!;
  const fillCurtain = root.querySelector<SVGLinearGradientElement>('[data-chart-fill-curtain]')!;
  const fillCurtainRect = root.querySelector<SVGRectElement>('[data-chart-fill-curtain-rect]')!;
  const marker = root.querySelector<SVGGElement>('[data-chart-marker]')!;
  const markerLine = root.querySelector<SVGLineElement>('[data-chart-marker-line]')!;
  const markerPoint = root.querySelector<SVGGElement>('[data-chart-marker-point]')!;
  const markerWaves = root.querySelector<HTMLElement>('[data-chart-marker-waves]')!;
  const markerGradient = root.querySelector<SVGLinearGradientElement>('[data-chart-marker-gradient]')!;
  const historyStatus = root.querySelector<HTMLElement>('[data-history-status]')!;
  const chartLoading = root.querySelector<HTMLElement>('[data-chart-loading]')!;
  const loadingDescription = root.querySelector<HTMLElement>('[data-loading-description]')!;
  const moneyFormat = (code: Currency) => new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', useGrouping: true, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  let money = moneyFormat(currency);
  // Early history trades below one unit, where whole-unit rounding would show "$0"; keep two significant digits there.
  const historicMoney = (price: number) => price >= 1 ? money.format(price)
    : new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumSignificantDigits: 2, maximumSignificantDigits: 2 }).format(price);
  const date = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dateTime = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const rangeBar = root.querySelector<HTMLElement>('[data-range-bar]')!;
  const chartControls = root.querySelector<HTMLElement>('[data-chart-controls]')!;
  const settingsMenu = root.querySelector<HTMLDetailsElement>('[data-chart-settings]')!;
  const settingsTrigger = root.querySelector<HTMLElement>('[data-settings-trigger]')!;
  const currencySelect = root.querySelector<HTMLSelectElement>('[data-currency]')!;
  const currencyStatus = root.querySelector<HTMLElement>('[data-currency-status]')!;
  const scaleOptions = [...root.querySelectorAll<HTMLInputElement>('[data-scale-option]')];
  const preferences = readRangePreferences();
  const counts = preferences.counts;
  let selected: BitcoinRange = preferences.selected === 'all'
    ? { unit: 'all' }
    : { unit: preferences.selected, count: counts[preferences.selected] };
  let scale: ChartScale = display.scale;
  let highLow = display.highLow;
  const exchangeRates = new CurrencyRates();
  const historyStart = Number(root.dataset.historyStart);
  let currencyLoading = false;
  let currencyError: 'rates' | 'history' | undefined;
  const candles = new Map<number, { points: HistoryPoint[]; updated: number }>();
  const candleRequests = new Map<number, Promise<void>>();
  const candleErrors = new Set<number>();
  let historyError = false;

  let history: HistoryPoint[] = [];
  let livePoint: HistoryPoint | undefined;
  let priceFeedState: PriceFeedState = 'connecting';
  let plottedPoints: HistoryPoint[] = [];
  let plottedPositions: { x: number; y: number }[] = [];
  let selectionRatio: number | undefined;
  let activePointer: number | undefined;
  let stopped = false;
  let historyLoading = false;
  let paintFrame = 0;
  let motionFrame = 0;
  let plottedRangeKey = '';
  const motion = new ChartMotion();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const priceTabTitle = createPriceTabTitle(root);
  if (currency !== 'USD') {
    line.setAttribute('d', '');
    area.setAttribute('d', '');
  }

  function rangeKey() {
    return selected.unit === 'all' ? 'all' : `${selected.unit}:${selected.count}`;
  }

  function paintMotion(now: number) {
    const scene = motion.sample(now);
    if (!scene) return;
    const { width, height } = chart.getBoundingClientRect();
    if (!width || !height) return;
    chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const paths = chartPaths(visibleHistory(scene.points, scene.viewport), width, height, scene.scale, scene.viewport);
    line.setAttribute('d', paths.line);
    area.setAttribute('d', paths.area);
    // A new line wipes in from the left; once drawn, its fill slides down from the top behind a soft edge.
    const revealing = motion.revealed < 1;
    if (revealing) {
      revealRect.setAttribute('y', String(-height));
      revealRect.setAttribute('width', String(width * motion.revealed));
      revealRect.setAttribute('height', String(height * 3));
      line.setAttribute('clip-path', 'url(#price-reveal)');
    } else line.removeAttribute('clip-path');
    if (motion.filled < 1) {
      const feather = height * .25;
      const edge = motion.filled * (height + feather);
      fillCurtain.setAttribute('y1', String(edge - feather));
      fillCurtain.setAttribute('y2', String(edge));
      fillCurtainRect.setAttribute('y', String(-height));
      fillCurtainRect.setAttribute('width', String(width));
      fillCurtainRect.setAttribute('height', String(height * 3));
      area.setAttribute('mask', 'url(#price-fill-curtain)');
    } else area.removeAttribute('mask');
    line.style.opacity = area.style.opacity = String(motion.opacity);
    chart.removeAttribute('data-chart-pending');
    fillGradient.setAttribute('y2', String(height));
    markerLine.setAttribute('y2', String(height));
    markerGradient.setAttribute('y2', String(height));
    if (!motion.animating) {
      plottedPositions = chartPositions(plottedPoints, width, height, scene.scale, scene.viewport);
      updatePriceDisplay();
    }
    updateExtremes(width);
    if (motion.presenting && !motionFrame && !document.hidden && !stopped) {
      motionFrame = requestAnimationFrame((time) => { motionFrame = 0; paintMotion(time); });
    }
  }

  function draw() {
    paintFrame = 0;
    const window = candleWindow(selected);
    const usdSource = window ? candles.get(window.interval)?.points ?? [] : history;
    const source = exchangeRates.convert(usdSource, currency) ?? [];
    const rate = exchangeRates.current(currency);
    const convertedLive = livePoint && rate ? { time: livePoint.time, price: livePoint.price * rate.rate } : undefined;
    const rangePoints = historyForRange(source, selected);
    const lastTime = rangePoints.at(-1)?.time;
    const maxGap = window ? window.interval * 60_000 * 2 : 2 * DAY_MS;
    const points = lastTime !== undefined && convertedLive && convertedLive.time >= lastTime && convertedLive.time - lastTime < maxGap ? [...rangePoints, convertedLive] : rangePoints;
    const currencyPending = currencyLoading && (!source.length || !rate);
    const loading = (window ? candleRequests.has(window.interval) && !usdSource.length : !history.length && !historyError) || currencyPending;
    const unavailable = window ? candleErrors.has(window.interval) : historyError;
    chart.setAttribute('aria-busy', String(loading));
    chartLoading.hidden = !loading;
    const loadingMessage = currencyPending ? settingsCopy.fxLoading : r.loading;
    if (loadingDescription.textContent !== loadingMessage) loadingDescription.textContent = loadingMessage;
    historyStatus.hidden = loading || !unavailable;
    historyStatus.textContent = window ? r.unavailable : t.history;
    const label = rangeLabel(selected);
    const formatter = window ? dateTime : date;
    const period = points.length ? `${formatter.format(points[0].time)} — ${formatter.format(points.at(-1)!.time)}` : loading ? r.loading : r.unavailable;
    const scaleLabel = scale === 'logarithmic' ? t.scale : t.linearScale;
    chart.setAttribute('aria-label', `${t.price} (${currency}) — ${scaleLabel}`);
    const extremes = highLow ? extremeIndices(points) : undefined;
    const extremesText = extremes ? ` ${settingsCopy.high}: ${historicMoney(points[extremes.high].price)}. ${settingsCopy.low}: ${historicMoney(points[extremes.low].price)}.` : '';
    root.querySelector<SVGDescElement>('[data-chart-description]')!.textContent = `${label}: ${period}. ${scaleLabel}. ${currency}.${extremesText}`;
    updateCurrencyStatus();
    // Keep the outgoing curve while a new candle interval is loading.
    if (loading && points.length < 2) return;
    plottedPoints = points;
    plottedRangeKey = rangeKey();
    if (points.length < 2) {
      motion.clear();
      line.setAttribute('d', '');
      area.setAttribute('d', '');
      plottedPositions = [];
      updateExtremes();
    } else {
      // Long ranges share the full curve; only the camera window changes.
      const renderPoints = points.at(-1) === convertedLive ? [...source, convertedLive!] : source;
      const now = performance.now();
      motion.update({ points: renderPoints, viewport: chartViewport(points, scale), scale, rangeKey: plottedRangeKey, seriesKey: window ? `candles:${window.interval}` : 'daily' }, now, reduceMotion.matches || document.hidden);
      paintMotion(now);
    }
    updatePriceDisplay();
  }

  // Label the visible range's high and low once the curve has settled; hide them while it moves or draws in.
  function updateExtremes(knownWidth?: number) {
    const extremes = highLow && !motion.animating && plottedRangeKey === rangeKey() && plottedPositions.length === plottedPoints.length
      ? extremeIndices(plottedPoints) : undefined;
    const width = extremes ? knownWidth ?? chart.getBoundingClientRect().width : 0;
    extremesEl.dataset.visible = String(Boolean(extremes && width));
    if (!extremes || !width) return;
    for (const kind of ['high', 'low'] as const) {
      const el = extremeEls[kind];
      const { x, y } = plottedPositions[extremes[kind]];
      const value = el.querySelector<HTMLElement>('[data-chart-extreme-value]')!;
      const text = historicMoney(plottedPoints[extremes[kind]].price);
      if (value.textContent !== text) value.textContent = text;
      el.style.transform = `translate(${x}px, ${y}px)`;
      // Centre the price over its point, but keep it at least 8px inside the plot near either edge.
      const labelWidth = value.offsetWidth || 0;
      const left = Math.max(8, Math.min(width - labelWidth - 8, x - labelWidth / 2));
      value.style.left = `${left - x}px`;
    }
  }

  function selectionIndex() {
    if (selectionRatio === undefined || plottedPoints.length < 2 || motion.animating || plottedRangeKey !== rangeKey()) return -1;
    const start = plottedPoints[0].time;
    const end = plottedPoints.at(-1)!.time;
    return nearestHistoryIndex(plottedPoints, start + selectionRatio * (end - start));
  }

  function updatePriceDisplay() {
    const index = selectionIndex();
    const point = plottedPoints[index];
    const position = plottedPositions[index];
    if (point && position) {
      markerLine.setAttribute('x1', String(position.x));
      markerLine.setAttribute('x2', String(position.x));
      markerPoint.setAttribute('transform', `translate(${position.x} ${position.y})`);
      markerWaves.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
      markerWaves.hidden = document.hidden;
      marker.setAttribute('visibility', 'visible');
      setPriceText(historicMoney(point.price));
      showingLive = false;
      priceEl.removeAttribute('aria-label');
      const formatter = candleWindow(selected) ? dateTime : date;
      priceChangeEl.textContent = `${formatter.format(point.time)}${candleWindow(selected) ? ' UTC' : ''}`;
      return;
    }
    marker.setAttribute('visibility', 'hidden');
    markerWaves.hidden = true;
    const rate = exchangeRates.current(currency);
    const live = livePoint && rate ? livePoint.price * rate.rate : undefined;
    // Like the app, live ticks roll in the price's direction; the first price, a currency change,
    // and returning from chart inspection snap instead.
    const rolls = live !== undefined && lastLive !== undefined && lastLive.currency === currency && showingLive && !reduceMotion.matches;
    if (live !== undefined && lastLive !== undefined && live !== lastLive.value) rollDirection = live > lastLive.value ? 1 : -1;
    lastLive = live === undefined ? undefined : { value: live, currency };
    showingLive = true;
    setPriceText(live !== undefined ? money.format(live) : '—', { direction: rollDirection, animate: rolls });
    if (livePoint && rate) priceEl.removeAttribute('aria-label');
    else priceEl.setAttribute('aria-label', t.unavailable);
    // All starts near zero, so its change would just repeat the current price.
    priceChangeEl.textContent = selected.unit === 'all' ? '' : formatPriceChange(plottedPoints);
  }

  function updatePageTitle(immediate = false) {
    const rate = exchangeRates.current(currency);
    // Historical selections and unavailable/stale feeds must not become a live tab price.
    priceTabTitle.update(!stopped && priceFeedState === 'live' && livePoint && rate
      ? money.format(livePoint.price * rate.rate)
      : undefined, immediate);
  }

  function clearSelection() {
    selectionRatio = undefined;
    updatePriceDisplay();
  }

  function setPriceText(value: string, roll: Parameters<RollingNumber['set']>[1] = { animate: false }) {
    priceEl.textContent = value;
    priceRoll?.set(value, roll);
    priceSizer.style.setProperty('--price-chars', String([...value].length));
    // Currencies without a symbol (CHF) already show their code in the price, so the label keeps only its chevron.
    priceSizer.dataset.codeInPrice = String(value.includes(currency));
  }

  function selectAtPointer(event: PointerEvent) {
    if (motion.animating || plottedRangeKey !== rangeKey()) return;
    const bounds = chart.getBoundingClientRect();
    if (!bounds.width) return;
    selectionRatio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    updatePriceDisplay();
  }

  chart.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    activePointer = event.pointerId;
    chart.setPointerCapture(event.pointerId);
    selectAtPointer(event);
  });
  // Mice and pens inspect on hover; touch inspects only while pressed so page gestures stay free.
  const hovers = (event: PointerEvent) => event.pointerType === 'mouse' || event.pointerType === 'pen';
  chart.addEventListener('pointermove', (event) => {
    if (event.pointerId === activePointer || (activePointer === undefined && event.isPrimary && hovers(event))) selectAtPointer(event);
  });
  chart.addEventListener('pointerleave', () => {
    if (activePointer === undefined) clearSelection();
  });
  chart.addEventListener('pointerup', (event) => {
    if (event.pointerId !== activePointer) return;
    activePointer = undefined;
    chart.releasePointerCapture(event.pointerId);
    // A hovering pointer is still over the chart, so keep showing the point beneath it.
    if (!hovers(event)) clearSelection();
  });
  chart.addEventListener('lostpointercapture', () => {
    if (activePointer !== undefined) { activePointer = undefined; clearSelection(); }
  });
  chart.addEventListener('pointercancel', () => { activePointer = undefined; clearSelection(); });
  chart.addEventListener('blur', clearSelection);
  chart.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { clearSelection(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || plottedPoints.length < 2 || motion.animating || plottedRangeKey !== rangeKey()) return;
    event.preventDefault();
    const current = selectionIndex();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? plottedPoints.length - 1
      : current < 0 ? (event.key === 'ArrowLeft' ? plottedPoints.length - 1 : 0)
      : Math.max(0, Math.min(plottedPoints.length - 1, current + (event.key === 'ArrowLeft' ? -1 : 1)));
    const start = plottedPoints[0].time;
    selectionRatio = (plottedPoints[index].time - start) / Math.max(plottedPoints.at(-1)!.time - start, 1);
    updatePriceDisplay();
  });

  function rangeLabel(range: BitcoinRange) {
    if (range.unit === 'all') return t.all;
    return new Intl.NumberFormat(locale, { style: 'unit', unit: range.unit, unitDisplay: 'long' }).format(range.count);
  }

  function updateRangeBar() {
    for (const slot of rangeBar.querySelectorAll<HTMLElement>('[data-range-slot]')) {
      const unit = slot.dataset.rangeSlot as BitcoinRange['unit'];
      const active = selected.unit === unit;
      slot.dataset.selected = String(active);
      const button = slot.querySelector<HTMLButtonElement>('[data-range-select]')!;
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', rangeLabel(unit === 'all' ? { unit } : { unit, count: counts[unit] }));
      if (unit === 'all') continue;
      button.querySelector<HTMLElement>('[data-range-label]')!.textContent = `${counts[unit]}${r.suffixes[unit]}`;
      for (const stepButton of slot.querySelectorAll<HTMLButtonElement>('[data-range-step]')) {
        const step = Number(stepButton.dataset.rangeStep);
        const next = rangeLabel({ unit, count: stepRange(unit, counts[unit], step) });
        stepButton.setAttribute('aria-label', `${step > 0 ? r.increase : r.decrease}: ${next}`);
        stepButton.tabIndex = active ? 0 : -1;
        stepButton.setAttribute('aria-hidden', String(!active));
      }
    }
    rangePill.select(selected.unit);
  }

  function selectRange(unit: BitcoinRange['unit']) {
    clearSelection();
    selected = unit === 'all' ? { unit } : { unit, count: counts[unit] };
    saveRangePreferences({ counts, selected: unit });
    updateRangeBar();
    void refreshCandles();
    scheduleDraw();
  }

  const rangePill = createRangePill(rangeBar, selectRange, (unit, step) => {
    counts[unit] = stepRange(unit, counts[unit], step);
    selectRange(unit);
  });
  rangeBar.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    const unit = button.closest<HTMLElement>('[data-range-slot]')!.dataset.rangeSlot as BitcoinRange['unit'];
    if (button.dataset.rangeStep && unit !== 'all') {
      counts[unit] = stepRange(unit, counts[unit], Number(button.dataset.rangeStep));
    }
    selectRange(unit);
  });
  rangeBar.addEventListener('keydown', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-range-select]');
    const unit = button?.dataset.rangeSelect as BitcoinRange['unit'] | undefined;
    if (!unit || unit === 'all' || selected.unit !== unit || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    counts[unit] = stepRange(unit, counts[unit], event.key === 'ArrowUp' ? 1 : -1);
    selectRange(unit);
  });
  updateRangeBar();
  chartControls.hidden = false;
  void refreshCandles();

  function closeSettings() {
    settingsMenu.open = false;
    settingsTrigger.focus({ preventScroll: true });
  }
  for (const option of scaleOptions) {
    option.checked = option.value === scale;
    option.addEventListener('change', () => {
      if (!option.checked || (option.value !== 'logarithmic' && option.value !== 'linear')) return;
      clearSelection();
      scale = option.value;
      saveDisplayPreferences({ scale, currency, highLow });
      scheduleDraw();
    });
  }
  highLowToggle.setAttribute('aria-checked', String(highLow));
  highLowToggle.addEventListener('click', () => {
    highLow = !highLow;
    highLowToggle.setAttribute('aria-checked', String(highLow));
    saveDisplayPreferences({ scale, currency, highLow });
    updateExtremes();
    scheduleDraw();
  });
  currencySelect.value = currency;
  currencySelect.disabled = false;
  function applyCurrency(next: Currency) {
    clearSelection();
    currency = next;
    currencySelect.value = next;
    money = moneyFormat(next);
    formatPriceChange = createPriceChangeFormatter(locale, currency);
    currencyError = undefined;
    currencyLoading = false;
    // Discard the old currency's scene immediately, including under reduced motion.
    motion.clear();
    plottedPoints = [];
    plottedPositions = [];
    line.setAttribute('d', '');
    area.setAttribute('d', '');
    updateExtremes();
    void refreshCurrency();
    updatePriceDisplay();
    updatePageTitle(true);
    updateCurrencyStatus();
    scheduleDraw();
  }
  currencySelect.addEventListener('change', () => {
    if (!isCurrency(currencySelect.value) || currencySelect.value === currency) return;
    applyCurrency(currencySelect.value);
    saveDisplayPreferences({ scale, currency, highLow });
  });
  const priceCurrency = root.querySelector<HTMLElement>('[data-price-currency-picker]')!;
  const priceCurrencyPicker = createCurrencyPicker(priceCurrency, currencySelect, { wrapper: priceCurrency });
  const stopCurrency = subscribeCurrencyPreference(next => {
    if (next === currency) return;
    applyCurrency(next);
    currencySelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  settingsMenu.addEventListener('keydown', (event) => {
    if (!event.defaultPrevented && event.key === 'Escape' && settingsMenu.open) {
      event.preventDefault();
      closeSettings();
    }
  });
  document.addEventListener('click', (event) => {
    if (settingsMenu.open && !settingsMenu.contains(event.target as Node)) settingsMenu.open = false;
  });
  document.addEventListener('focusin', (event) => {
    if (settingsMenu.open && !settingsMenu.contains(event.target as Node)) settingsMenu.open = false;
  });

  // Price-only view: just the live price, centred and large. It uses browser fullscreen where available,
  // and leaving fullscreen (or pressing Escape, or the exit button) returns to the chart.
  const priceOnlyEnter = root.querySelector<HTMLButtonElement>('[data-price-only-enter]')!;
  const priceOnlyExit = root.querySelector<HTMLButtonElement>('[data-price-only-exit]')!;
  let priceOnly = false;
  let priceOnlyFullscreen = false;
  const fullscreenControls = createChartFullscreenControls(root, { isActive: () => priceOnly });
  function setPriceOnly(next: boolean) {
    if (next === priceOnly) return;
    priceOnly = next;
    if (next) {
      settingsMenu.open = false;
      clearSelection();
      root.setAttribute('data-price-only', '');
    } else root.removeAttribute('data-price-only');
    priceOnlyExit.hidden = !next;
    // The price is display-only here; keep its currency menu out of reach.
    priceSizer.tabIndex = next ? -1 : 0;
    fullscreenControls.refresh();
    if (next) {
      priceOnlyExit.focus({ preventScroll: true });
      if (document.fullscreenEnabled && !document.fullscreenElement) {
        document.documentElement.requestFullscreen()
          .then(() => {
            if (!priceOnly) { void document.exitFullscreen(); return; }
            priceOnlyFullscreen = true;
            // Phones and tablets that allow it stay in landscape; others get the sideways layout in portrait.
            void (window.screen?.orientation as (ScreenOrientation & { lock?: (orientation: string) => Promise<void> }) | undefined)?.lock?.('landscape').catch(() => {});
          })
          .catch(() => { /* The in-page view works without fullscreen. */ });
      }
    } else {
      window.screen?.orientation?.unlock?.();
      if (priceOnlyFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      priceOnlyFullscreen = false;
      settingsTrigger.focus({ preventScroll: true });
      scheduleDraw();
    }
  }
  function onPriceOnlyFullscreenChange() {
    if (priceOnlyFullscreen && !document.fullscreenElement) { priceOnlyFullscreen = false; setPriceOnly(false); }
  }
  function onPriceOnlyKeyDown(event: KeyboardEvent) {
    if (priceOnly && event.key === 'Escape') { event.preventDefault(); setPriceOnly(false); }
  }
  function onPriceOnlyPointerDown(event: PointerEvent) {
    // Touch never hovers, so a tap brings back the exit button.
    if (priceOnly && event.pointerType === 'touch') fullscreenControls.reveal();
  }
  priceOnlyEnter.addEventListener('click', () => setPriceOnly(true));
  priceOnlyExit.addEventListener('click', () => setPriceOnly(false));
  document.addEventListener('fullscreenchange', onPriceOnlyFullscreenChange);
  document.addEventListener('keydown', onPriceOnlyKeyDown);
  window.addEventListener('pointerdown', onPriceOnlyPointerDown);

  function updateCurrencyStatus() {
    const rate = exchangeRates.current(currency);
    const window = candleWindow(selected);
    const source = window ? candles.get(window.interval)?.points ?? [] : history;
    const missingHistory = source.length > 0 && !exchangeRates.convert(source, currency);
    const unavailable = currency !== 'USD' && (!rate || currencyError || missingHistory);
    currencyStatus.hidden = currency === 'USD' || currencyLoading || !unavailable;
    currencyStatus.textContent = !rate || currencyError === 'rates' ? settingsCopy.fxUnavailable : settingsCopy.fxHistoryUnavailable;
  }

  async function refreshCurrency() {
    if (stopped || document.hidden || !exchangeRates.needsRefresh(currency)) return;
    const target = currency;
    currencyLoading = true;
    currencyError = undefined;
    updateCurrencyStatus();
    const requests = [
      exchangeRates.refreshLatest().finally(() => { if (!stopped && target === currency) { updatePageTitle(); updatePriceDisplay(); scheduleDraw(); } }),
      exchangeRates.refreshHistory(target, historyStart),
    ];
    const results = await Promise.allSettled(requests);
    if (stopped || target !== currency) return;
    currencyLoading = false;
    currencyError = results[0].status === 'rejected' ? 'rates' : results[1].status === 'rejected' ? 'history' : undefined;
    updateCurrencyStatus();
    scheduleDraw();
  }

  function scheduleDraw() {
    if (!paintFrame && !stopped && !document.hidden) paintFrame = requestAnimationFrame(draw);
  }

  function onMotionPreferenceChange() {
    if (reduceMotion.matches) {
      motion.finish();
      cancelAnimationFrame(motionFrame);
      motionFrame = 0;
      paintMotion(performance.now());
    }
  }
  reduceMotion.addEventListener('change', onMotionPreferenceChange);

  async function getJson(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Price API: ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.error) || body.error.length || !body.result) throw new Error('Invalid price response');
    return body.result;
  }

  async function refreshCandles(force = false) {
    const window = candleWindow(selected);
    if (!window || stopped || document.hidden) return;
    const { interval } = window;
    const cached = candles.get(interval);
    if (!force && cached && Date.now() - cached.updated < 60_000) return;
    if (candleRequests.has(interval)) return candleRequests.get(interval);
    const request = (async () => {
      try {
        const result = await getJson(`https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${interval}`);
        candles.set(interval, { points: parseCandles(result), updated: Date.now() });
        candleErrors.delete(interval);
      } catch {
        candleErrors.add(interval);
      } finally {
        candleRequests.delete(interval);
        scheduleDraw();
      }
    })();
    candleRequests.set(interval, request);
    scheduleDraw();
    return request;
  }

  async function refreshHistory() {
    if (historyLoading || stopped || document.hidden) return;
    historyLoading = true;
    try {
      const result = await getJson('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440');
      const recent = parseCandles(result);
      // Never draw an invented straight connector if the bundled CSV is too old.
      const hasGap = recent[0].time > history.at(-1)!.time + DAY_MS;
      if (hasGap) throw new Error('Historical data needs updating');
      history = mergeHistory(history, recent);
      historyError = false;
    } catch {
      historyError = true;
    } finally {
      historyLoading = false;
      scheduleDraw();
    }
  }

  const resizeObserver = new ResizeObserver(scheduleDraw);
  resizeObserver.observe(chart);
  // Bundled data is also rendered at build time, so the chart works before JS.
  void (async () => {
    try {
      const response = await fetch('/data/btc-history.csv');
      if (!response.ok) throw new Error('History unavailable');
      history = parseHistory(await response.text());
      scheduleDraw();
      await refreshHistory();
    } catch { historyError = true; scheduleDraw(); }
  })();

  const stopPriceFeed = subscribeBitcoinPrice({
    keepAliveWhenHidden: () => priceTabTitle.enabled,
    onPrice(point) {
      livePoint = point;
      updatePageTitle();
      if (!document.hidden) { updatePriceDisplay(); scheduleDraw(); }
    },
    onState(state) { priceFeedState = state; if (state !== 'live') updatePageTitle(); },
  });
  void refreshCurrency();
  let timers: ReturnType<typeof setInterval>[] = [];
  function stopTimers() {
    timers.forEach(clearInterval);
    timers = [];
  }
  function startTimers() {
    if (timers.length || stopped || document.hidden) return;
    timers = [
      setInterval(() => { if (history.length) void refreshHistory(); }, 900_000),
      setInterval(() => { void refreshCandles(); void refreshCurrency(); }, 60_000),
    ];
  }
  startTimers();

  window.addEventListener('online', () => { if (history.length) void refreshHistory(); void refreshCandles(); void refreshCurrency(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopTimers();
      cancelAnimationFrame(paintFrame);
      paintFrame = 0;
      markerWaves.hidden = true;
      motion.finish();
      cancelAnimationFrame(motionFrame);
      motionFrame = 0;
    } else if (!stopped) { startTimers(); scheduleDraw(); if (history.length) void refreshHistory(); void refreshCandles(true); void refreshCurrency(); }
  });
  window.addEventListener('pagehide', () => {
    stopped = true;
    stopCurrency();
    priceTabTitle.destroy();
    resizeObserver.disconnect();
    cancelAnimationFrame(paintFrame);
    cancelAnimationFrame(motionFrame);
    reduceMotion.removeEventListener('change', onMotionPreferenceChange);
    rangePill.destroy();
    priceCurrencyPicker.destroy();
    document.removeEventListener('fullscreenchange', onPriceOnlyFullscreenChange);
    document.removeEventListener('keydown', onPriceOnlyKeyDown);
    window.removeEventListener('pointerdown', onPriceOnlyPointerDown);
    fullscreenControls.destroy();
    stopTimers();
    stopPriceFeed();
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
}
