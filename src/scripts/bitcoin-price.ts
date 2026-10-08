import { DAY_MS, chartPaths, mergeHistory, nearestHistoryIndex, parseHistory, type HistoryPoint } from '../lib/bitcoin-chart';
import { createPriceChangeFormatter } from '../lib/bitcoin-price-change';
import type { TrackerCopy } from '../i18n/tracker';
import type { RangeCopy } from '../i18n/ranges';
import { candleWindow, historyForRange, parseCandles, rangeSlots, stepRange, type BitcoinRange, type RangeUnit } from '../lib/bitcoin-range';

const root = document.querySelector<HTMLElement>('[data-bitcoin-tracker]');
if (root) startTracker(root);

function startTracker(root: HTMLElement) {
  const t: TrackerCopy = JSON.parse(root.dataset.copy!);
  const r: RangeCopy = JSON.parse(root.dataset.rangeCopy!);
  const locale = root.dataset.locale || 'en';
  const priceEl = root.querySelector<HTMLElement>('[data-price]')!;
  const priceChangeEl = root.querySelector<HTMLElement>('[data-price-change]')!;
  const formatPriceChange = createPriceChangeFormatter(locale);
  const chart = root.querySelector<SVGSVGElement>('[data-chart]')!;
  const line = root.querySelector<SVGPathElement>('[data-chart-line]')!;
  const area = root.querySelector<SVGPathElement>('[data-chart-area]')!;
  const marker = root.querySelector<SVGGElement>('[data-chart-marker]')!;
  const markerLine = root.querySelector<SVGLineElement>('[data-chart-marker-line]')!;
  const markerDot = root.querySelector<SVGCircleElement>('[data-chart-marker-dot]')!;
  const markerGradient = root.querySelector<SVGLinearGradientElement>('[data-chart-marker-gradient]')!;
  const historyStatus = root.querySelector<HTMLElement>('[data-history-status]')!;
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dateTime = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const rangeBar = root.querySelector<HTMLElement>('[data-range-bar]')!;
  const counts = Object.fromEntries(rangeSlots.map(({ unit, initial }) => [unit, initial])) as Record<RangeUnit, number>;
  let selected: BitcoinRange = { unit: 'all' };
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
  let feedState: 'connecting' | 'live' | 'delayed' | 'offline' = 'connecting';

  function setStatus(state: 'connecting' | 'live' | 'delayed' | 'offline') {
    feedState = state;
  }

  function draw() {
    paintFrame = 0;
    const window = candleWindow(selected);
    const source = window ? candles.get(window.interval)?.points ?? [] : history;
    const rangePoints = historyForRange(source, selected);
    const lastTime = rangePoints.at(-1)?.time;
    const maxGap = window ? window.interval * 60_000 * 2 : 2 * DAY_MS;
    const points = lastTime !== undefined && livePoint && livePoint.time >= lastTime && livePoint.time - lastTime < maxGap ? [...rangePoints, livePoint] : rangePoints;
    const loading = window ? candleRequests.has(window.interval) && !source.length : !history.length && !historyError;
    const unavailable = window ? candleErrors.has(window.interval) : historyError;
    chart.setAttribute('aria-busy', String(loading));
    historyStatus.hidden = !loading && !unavailable;
    historyStatus.textContent = loading ? r.loading : window ? r.unavailable : t.history;
    const { width, height } = chart.getBoundingClientRect();
    if (!width || !height) return;
    // Draw at actual CSS size so the app's line thickness and 5% padding match.
    chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const paths = chartPaths(points, width, height);
    line.setAttribute('d', paths.line);
    area.setAttribute('d', paths.area);
    plottedPoints = points;
    plottedPositions = paths.positions;
    markerLine.setAttribute('y2', String(height));
    markerGradient.setAttribute('y2', String(height));
    updatePriceDisplay();
    const label = rangeLabel(selected);
    const formatter = window ? dateTime : date;
    const period = points.length ? `${formatter.format(points[0].time)} — ${formatter.format(points.at(-1)!.time)}` : loading ? r.loading : r.unavailable;
    root.querySelector<SVGDescElement>('[data-chart-description]')!.textContent = `${label}: ${period}. ${t.scale}.`;
  }

  function selectionIndex() {
    if (selectionRatio === undefined || plottedPoints.length < 2) return -1;
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
      markerDot.setAttribute('cx', String(position.x));
      markerDot.setAttribute('cy', String(position.y));
      marker.setAttribute('visibility', 'visible');
      priceEl.textContent = money.format(point.price);
      priceEl.removeAttribute('aria-label');
      const formatter = candleWindow(selected) ? dateTime : date;
      priceChangeEl.textContent = `${formatter.format(point.time)}${candleWindow(selected) ? ' UTC' : ''}`;
      return;
    }
    marker.setAttribute('visibility', 'hidden');
    priceEl.textContent = livePoint ? money.format(livePoint.price) : '—';
    if (livePoint) priceEl.removeAttribute('aria-label');
    else priceEl.setAttribute('aria-label', t.unavailable);
    priceChangeEl.textContent = formatPriceChange(plottedPoints);
  }

  function clearSelection() {
    selectionRatio = undefined;
    updatePriceDisplay();
  }

  function selectAtPointer(event: PointerEvent) {
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
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || plottedPoints.length < 2) return;
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
      button.textContent = `${counts[unit]}${r.suffixes[unit]}`;
      for (const stepButton of slot.querySelectorAll<HTMLButtonElement>('[data-range-step]')) {
        const step = Number(stepButton.dataset.rangeStep);
        const next = rangeLabel({ unit, count: stepRange(unit, counts[unit], step) });
        stepButton.setAttribute('aria-label', `${step > 0 ? r.increase : r.decrease}: ${next}`);
        stepButton.tabIndex = active ? 0 : -1;
        stepButton.setAttribute('aria-hidden', String(!active));
      }
    }
  }

  function selectRange(unit: BitcoinRange['unit']) {
    clearSelection();
    selected = unit === 'all' ? { unit } : { unit, count: counts[unit] };
    updateRangeBar();
    void refreshCandles();
    scheduleDraw();
  }

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
  rangeBar.hidden = false;

  function scheduleDraw() {
    if (!paintFrame) paintFrame = requestAnimationFrame(draw);
  }

  function applyPrice(value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    livePoint = { time: Date.now(), price: value };
    updatePriceDisplay();
    scheduleDraw();
  }

  async function getJson(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Price API: ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.error) || body.error.length || !body.result) throw new Error('Invalid price response');
    return body.result;
  }

  async function refreshCandles() {
    const window = candleWindow(selected);
    if (!window || stopped) return;
    const { interval } = window;
    const cached = candles.get(interval);
    if (cached && Date.now() - cached.updated < 60_000) return;
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
    if (historyLoading || stopped) return;
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
    if (polling || stopped || !navigator.onLine) return;
    if (feedState === 'live') return;
    polling = true;
    try {
      const result = await getJson('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
      const ticker = Object.values(result)[0] as { c?: string[] } | undefined;
      const price = Number(ticker?.c?.[0]);
      if (!Number.isFinite(price) || price <= 0) throw new Error('Missing ticker price');
      // A late REST response must never replace a newer stream update.
      if (feedState !== 'live') {
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
    if (stopped || !navigator.onLine) return;
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
      if (stopped) return;
      setStatus(navigator.onLine ? 'delayed' : 'offline');
      void pollPrice();
      reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 30_000));
    });
  }

  new ResizeObserver(scheduleDraw).observe(chart);
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
  const watchdog = setInterval(() => {
    if (stopped) return;
    if (socket && (Date.now() - lastMessage > 30_000 || (feedState === 'live' && Date.now() - lastStreamTick > 60_000))) {
      setStatus('delayed');
      socket.close();
    }
  }, 5000);
  const pollTimer = setInterval(() => { void pollPrice(); }, 30_000);
  const historyTimer = setInterval(() => { if (history.length) void refreshHistory(); }, 300_000);
  const candleTimer = setInterval(() => { void refreshCandles(); }, 60_000);

  window.addEventListener('offline', () => { setStatus('offline'); socket?.close(); });
  window.addEventListener('online', () => { connect(); void pollPrice(); if (history.length) void refreshHistory(); void refreshCandles(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !stopped) { connect(); void pollPrice(); if (history.length) void refreshHistory(); void refreshCandles(); }
  });
  window.addEventListener('pagehide', () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    clearInterval(watchdog);
    clearInterval(pollTimer);
    clearInterval(historyTimer);
    clearInterval(candleTimer);
    socket?.close();
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
}
