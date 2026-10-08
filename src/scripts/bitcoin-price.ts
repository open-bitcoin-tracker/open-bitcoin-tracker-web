import { DAY_MS, chartPaths, mergeHistory, parseHistory, type HistoryPoint } from '../lib/bitcoin-chart';
import type { TrackerCopy } from '../i18n/tracker';

const root = document.querySelector<HTMLElement>('[data-bitcoin-tracker]');
if (root) startTracker(root);

function startTracker(root: HTMLElement) {
  const t: TrackerCopy = JSON.parse(root.dataset.copy!);
  const locale = root.dataset.locale || 'en';
  const priceEl = root.querySelector<HTMLElement>('[data-price]')!;
  const chart = root.querySelector<SVGSVGElement>('[data-chart]')!;
  const line = root.querySelector<SVGPathElement>('[data-chart-line]')!;
  const area = root.querySelector<SVGPathElement>('[data-chart-area]')!;
  const historyStatus = root.querySelector<HTMLElement>('[data-history-status]')!;
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

  let history: HistoryPoint[] = [];
  let livePoint: HistoryPoint | undefined;
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
    if (history.length < 2) return;
    const lastTime = history.at(-1)!.time;
    const points = livePoint && livePoint.time >= lastTime && livePoint.time - lastTime < 2 * DAY_MS ? [...history, livePoint] : history;
    const { width, height } = chart.getBoundingClientRect();
    if (!width || !height) return;
    // Draw at actual CSS size so the app's line thickness and 5% padding match.
    chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const paths = chartPaths(points, width, height);
    line.setAttribute('d', paths.line);
    area.setAttribute('d', paths.area);
    const range = `2010 — ${date.format(points.at(-1)!.time)}`;
    root.querySelector<SVGDescElement>('[data-chart-description]')!.textContent = `${t.all}: ${range}. ${t.scale}.`;
  }

  function scheduleDraw() {
    if (!paintFrame) paintFrame = requestAnimationFrame(draw);
  }

  function applyPrice(value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    livePoint = { time: Date.now(), price: value };
    priceEl.textContent = money.format(value);
    priceEl.removeAttribute('aria-label');
    scheduleDraw();
  }

  async function getJson(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Price API: ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.error) || body.error.length || !body.result) throw new Error('Invalid price response');
    return body.result;
  }

  async function refreshHistory() {
    if (historyLoading || stopped) return;
    historyLoading = true;
    try {
      const result = await getJson('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440');
      const rows = Object.values(result).find(Array.isArray);
      if (!rows) throw new Error('Missing daily prices');
      const recent: HistoryPoint[] = rows.flatMap((row: unknown) => {
        if (!Array.isArray(row)) return [];
        const time = Number(row[0]) * 1000;
        const price = Number(row[4]);
        return Number.isFinite(time) && Number.isFinite(price) && price > 0 ? [{ time, price }] : [];
      });
      if (!recent.length) throw new Error('Empty daily prices');
      // Never draw an invented straight connector if the bundled CSV is too old.
      const hasGap = recent[0].time > history.at(-1)!.time + DAY_MS;
      if (hasGap) throw new Error('Historical data needs updating');
      history = mergeHistory(history, recent);
      historyStatus.hidden = true;
      scheduleDraw();
    } catch {
      historyStatus.hidden = false;
    } finally {
      historyLoading = false;
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
      if (!livePoint) priceEl.setAttribute('aria-label', t.unavailable);
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
    } catch { historyStatus.hidden = false; }
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

  window.addEventListener('offline', () => { setStatus('offline'); socket?.close(); });
  window.addEventListener('online', () => { connect(); void pollPrice(); if (history.length) void refreshHistory(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !stopped) { connect(); void pollPrice(); if (history.length) void refreshHistory(); }
  });
  window.addEventListener('pagehide', () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    clearInterval(watchdog);
    clearInterval(pollTimer);
    clearInterval(historyTimer);
    socket?.close();
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
}
