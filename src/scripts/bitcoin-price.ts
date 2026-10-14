import { DAY_MS, chartPaths, chartPositions, chartViewport, mergeHistory, nearestHistoryIndex, parseHistory, visibleHistory, type ChartScale, type HistoryPoint } from '../lib/bitcoin-chart';
import { ChartMotion } from '../lib/bitcoin-chart-motion';
import { createPriceChangeFormatter } from '../lib/bitcoin-price-change';
import type { TrackerCopy } from '../i18n/tracker';
import type { RangeCopy } from '../i18n/ranges';
import { candleWindow, historyForRange, parseCandles, stepRange, type BitcoinRange, type RangeUnit } from '../lib/bitcoin-range';
import { createRangePill } from './bitcoin-range-pill';
import { readRangePreferences, saveRangePreferences } from '../lib/bitcoin-range-preferences';
import { CurrencyRates, isCurrency, type Currency } from '../lib/bitcoin-currency';
import { readDisplayPreferences, saveDisplayPreferences } from '../lib/bitcoin-display-preferences';
import type { ChartSettingsCopy } from '../i18n/chart-settings';

const root = document.querySelector<HTMLElement>('[data-bitcoin-tracker]');
if (root) startTracker(root);

function startTracker(root: HTMLElement) {
  const t: TrackerCopy = JSON.parse(root.dataset.copy!);
  const r: RangeCopy = JSON.parse(root.dataset.rangeCopy!);
  const settingsCopy: ChartSettingsCopy = JSON.parse(root.dataset.settingsCopy!);
  const locale = root.dataset.locale || 'en';
  const priceEl = root.querySelector<HTMLElement>('[data-price]')!;
  const priceChangeEl = root.querySelector<HTMLElement>('[data-price-change]')!;
  const display = readDisplayPreferences();
  let currency: Currency = display.currency;
  let formatPriceChange = createPriceChangeFormatter(locale, currency);
  const chart = root.querySelector<SVGSVGElement>('[data-chart]')!;
  const line = root.querySelector<SVGPathElement>('[data-chart-line]')!;
  const area = root.querySelector<SVGPathElement>('[data-chart-area]')!;
  const fillGradient = root.querySelector<SVGLinearGradientElement>('[data-chart-fill-gradient]')!;
  const marker = root.querySelector<SVGGElement>('[data-chart-marker]')!;
  const markerLine = root.querySelector<SVGLineElement>('[data-chart-marker-line]')!;
  const markerPoint = root.querySelector<SVGGElement>('[data-chart-marker-point]')!;
  const markerWaves = root.querySelector<HTMLElement>('[data-chart-marker-waves]')!;
  const markerGradient = root.querySelector<SVGLinearGradientElement>('[data-chart-marker-gradient]')!;
  const historyStatus = root.querySelector<HTMLElement>('[data-history-status]')!;
  const chartLoading = root.querySelector<HTMLElement>('[data-chart-loading]')!;
  const loadingDescription = root.querySelector<HTMLElement>('[data-loading-description]')!;
  let money = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dateTime = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const rangeBar = root.querySelector<HTMLElement>('[data-range-bar]')!;
  const chartControls = root.querySelector<HTMLElement>('[data-chart-controls]')!;
  const settingsMenu = root.querySelector<HTMLDetailsElement>('[data-chart-settings]')!;
  const settingsTrigger = root.querySelector<HTMLElement>('[data-settings-trigger]')!;
  const currencyOptions = [...root.querySelectorAll<HTMLInputElement>('[data-currency-option]')];
  const currencyStatus = root.querySelector<HTMLElement>('[data-currency-status]')!;
  const scaleOptions = [...root.querySelectorAll<HTMLInputElement>('[data-scale-option]')];
  const preferences = readRangePreferences();
  const counts = preferences.counts;
  let selected: BitcoinRange = preferences.selected === 'all'
    ? { unit: 'all' }
    : { unit: preferences.selected, count: counts[preferences.selected] };
  let scale: ChartScale = display.scale;
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
  let plottedPoints: HistoryPoint[] = [];
  let plottedPositions: { x: number; y: number }[] = [];
  let selectionRatio: number | undefined;
  let activePointer: number | undefined;
  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let lastMessage = 0;
  let lastStreamTick = 0;
  let stopped = false;
  let polling = false;
  let historyLoading = false;
  let paintFrame = 0;
  let motionFrame = 0;
  let plottedRangeKey = '';
  const motion = new ChartMotion();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let feedState: 'connecting' | 'live' | 'delayed' | 'offline' = 'connecting';
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
    line.style.opacity = area.style.opacity = String(motion.opacity);
    fillGradient.setAttribute('y2', String(height));
    markerLine.setAttribute('y2', String(height));
    markerGradient.setAttribute('y2', String(height));
    if (!motion.animating) {
      plottedPositions = chartPositions(plottedPoints, width, height, scene.scale, scene.viewport);
      updatePriceDisplay();
    }
    if (motion.animating && !motionFrame && !document.hidden && !stopped) {
      motionFrame = requestAnimationFrame((time) => { motionFrame = 0; paintMotion(time); });
    }
  }

  function setStatus(state: 'connecting' | 'live' | 'delayed' | 'offline') {
    feedState = state;
  }

  function streamIsLive() {
    return feedState === 'live';
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
    root.querySelector<SVGDescElement>('[data-chart-description]')!.textContent = `${label}: ${period}. ${scaleLabel}. ${currency}.`;
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
    } else {
      // Long ranges share the full curve; only the camera window changes.
      const renderPoints = points.at(-1) === convertedLive ? [...source, convertedLive!] : source;
      const now = performance.now();
      motion.update({ points: renderPoints, viewport: chartViewport(points, scale), scale, rangeKey: plottedRangeKey, seriesKey: window ? `candles:${window.interval}` : 'daily' }, now, reduceMotion.matches || document.hidden);
      paintMotion(now);
    }
    updatePriceDisplay();
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
      setPriceText(money.format(point.price));
      priceEl.removeAttribute('aria-label');
      const formatter = candleWindow(selected) ? dateTime : date;
      priceChangeEl.textContent = `${formatter.format(point.time)}${candleWindow(selected) ? ' UTC' : ''}`;
      return;
    }
    marker.setAttribute('visibility', 'hidden');
    markerWaves.hidden = true;
    const rate = exchangeRates.current(currency);
    setPriceText(livePoint && rate ? money.format(livePoint.price * rate.rate) : '—');
    if (livePoint && rate) priceEl.removeAttribute('aria-label');
    else priceEl.setAttribute('aria-label', t.unavailable);
    priceChangeEl.textContent = formatPriceChange(plottedPoints);
  }

  function clearSelection() {
    selectionRatio = undefined;
    updatePriceDisplay();
  }

  function setPriceText(value: string) {
    priceEl.textContent = value;
    priceEl.style.setProperty('--price-chars', String([...value].length));
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
  chart.addEventListener('pointermove', (event) => {
    if (event.pointerId === activePointer) selectAtPointer(event);
  });
  chart.addEventListener('pointerleave', () => {
    if (activePointer === undefined) clearSelection();
  });
  chart.addEventListener('pointerup', (event) => {
    if (event.pointerId !== activePointer) return;
    activePointer = undefined;
    chart.releasePointerCapture(event.pointerId);
    clearSelection();
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
  for (const option of [...scaleOptions, ...currencyOptions]) {
    // A click on the current selection does not fire a change event.
    option.addEventListener('click', () => {
      if (option.checked) closeSettings();
    });
  }
  for (const option of scaleOptions) {
    option.checked = option.value === scale;
    option.addEventListener('change', () => {
      if (!option.checked || (option.value !== 'logarithmic' && option.value !== 'linear')) return;
      clearSelection();
      scale = option.value;
      saveDisplayPreferences({ scale, currency });
      scheduleDraw();
      closeSettings();
    });
  }
  for (const option of currencyOptions) {
    option.checked = option.value === currency;
    option.addEventListener('change', () => {
      if (!option.checked || !isCurrency(option.value)) return;
      clearSelection();
      currency = option.value;
      money = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
      formatPriceChange = createPriceChangeFormatter(locale, currency);
      saveDisplayPreferences({ scale, currency });
      currencyError = undefined;
      currencyLoading = false;
      // Discard the old currency's scene immediately, including under reduced motion.
      motion.clear();
      plottedPoints = [];
      plottedPositions = [];
      line.setAttribute('d', '');
      area.setAttribute('d', '');
      void refreshCurrency();
      updatePriceDisplay();
      updateCurrencyStatus();
      scheduleDraw();
      closeSettings();
    });
  }
  settingsMenu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && settingsMenu.open) {
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
      exchangeRates.refreshLatest().finally(() => { if (!stopped && target === currency) { updatePriceDisplay(); scheduleDraw(); } }),
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

  function applyPrice(value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    livePoint = { time: Date.now(), price: value };
    if (!document.hidden && !stopped) {
      updatePriceDisplay();
      scheduleDraw();
    }
  }

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

  async function pollPrice() {
    if (polling || stopped || document.hidden || !navigator.onLine) return;
    if (streamIsLive()) return;
    polling = true;
    try {
      const result = await getJson('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
      const ticker = Object.values(result)[0] as { c?: string[] } | undefined;
      const price = Number(ticker?.c?.[0]);
      if (!Number.isFinite(price) || price <= 0) throw new Error('Missing ticker price');
      // A late REST response must never replace a newer stream update.
      if (!streamIsLive() && !stopped && !document.hidden) {
        applyPrice(price);
        setStatus('delayed');
      }
    } catch {
      if (!livePoint && selectionIndex() < 0) priceEl.setAttribute('aria-label', t.unavailable);
    } finally {
      polling = false;
    }
  }

  function connect() {
    if (stopped || document.hidden || !navigator.onLine) return;
    clearTimeout(reconnectTimer);
    if (socket && socket.readyState < WebSocket.CLOSING) return;
    setStatus(livePoint ? 'delayed' : 'connecting');
    const connection = new WebSocket('wss://ws.kraken.com/v2');
    socket = connection;
    lastMessage = Date.now();
    connection.addEventListener('open', () => {
      connection.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: ['BTC/USD'], snapshot: true } }));
    });
    connection.addEventListener('message', (event) => {
      if (socket !== connection || stopped) return;
      lastMessage = Date.now();
      try {
        const message = JSON.parse(event.data);
        if (message.method === 'subscribe' && message.success === false) { connection.close(); return; }
        if (message.channel !== 'ticker' || !['snapshot', 'update'].includes(message.type)) return;
        const ticker = message.data?.find((entry: { symbol?: string }) => entry.symbol === 'BTC/USD');
        if (typeof ticker?.last !== 'number' || !Number.isFinite(ticker.last) || ticker.last <= 0) return;
        attempts = 0;
        lastStreamTick = Date.now();
        applyPrice(ticker.last);
        setStatus('live');
      } catch { /* Ignore unrelated or malformed stream messages. */ }
    });
    connection.addEventListener('error', () => connection.close());
    connection.addEventListener('close', () => {
      if (socket !== connection) return;
      socket = undefined;
      if (stopped || document.hidden) return;
      setStatus(navigator.onLine ? 'delayed' : 'offline');
      void pollPrice();
      reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 30_000));
    });
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

  connect();
  void pollPrice();
  void refreshCurrency();
  function checkStream() {
    if (socket && (Date.now() - lastMessage > 30_000 || (feedState === 'live' && Date.now() - lastStreamTick > 60_000))) {
      setStatus('delayed');
      socket.close();
    }
  }
  let timers: ReturnType<typeof setInterval>[] = [];
  function stopTimers() {
    timers.forEach(clearInterval);
    timers = [];
  }
  function startTimers() {
    if (timers.length || stopped || document.hidden) return;
    timers = [
      setInterval(checkStream, 5000),
      setInterval(() => { void pollPrice(); }, 30_000),
      setInterval(() => { if (history.length) void refreshHistory(); }, 900_000),
      setInterval(() => { void refreshCandles(); void refreshCurrency(); }, 60_000),
    ];
  }
  startTimers();

  window.addEventListener('offline', () => { setStatus('offline'); socket?.close(); });
  window.addEventListener('online', () => { connect(); void pollPrice(); if (history.length) void refreshHistory(); void refreshCandles(); void refreshCurrency(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopTimers();
      clearTimeout(reconnectTimer);
      socket?.close();
      cancelAnimationFrame(paintFrame);
      paintFrame = 0;
      markerWaves.hidden = true;
      motion.finish();
      cancelAnimationFrame(motionFrame);
      motionFrame = 0;
    } else if (!stopped) { startTimers(); scheduleDraw(); connect(); void pollPrice(); if (history.length) void refreshHistory(); void refreshCandles(true); void refreshCurrency(); }
  });
  window.addEventListener('pagehide', () => {
    stopped = true;
    resizeObserver.disconnect();
    cancelAnimationFrame(paintFrame);
    cancelAnimationFrame(motionFrame);
    reduceMotion.removeEventListener('change', onMotionPreferenceChange);
    rangePill.destroy();
    clearTimeout(reconnectTimer);
    stopTimers();
    socket?.close();
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
}
