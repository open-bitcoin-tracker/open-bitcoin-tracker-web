import { DAY_MS, type HistoryPoint } from '../lib/bitcoin-chart';
import { mergePreviewHistory, previewPaths, type PreviewHistory } from '../lib/bitcoin-preview';
import { parseCandles } from '../lib/bitcoin-range';

/** Homepage-only polling: no sockets, full CSV download, controls or chart runtime. */
export function startBitcoinPreview(root: HTMLElement) {
  const locale = root.dataset.locale || 'en';
  const copy: { price: string; updated: string; unavailable: string } = JSON.parse(root.dataset.copy!);
  const packed: number[][][] = JSON.parse(root.dataset.history!);
  let history: PreviewHistory = packed.map(segment => segment.map(([day, price]) => ({ time: day * DAY_MS, price })));
  const price = root.querySelector<HTMLElement>('[data-preview-price]')!;
  const status = root.querySelector<HTMLElement>('[data-preview-status]')!;
  const historyStatus = root.querySelector<HTMLElement>('[data-preview-history-status]')!;
  const line = root.querySelector<SVGPathElement>('[data-preview-line]')!;
  const area = root.querySelector<SVGPathElement>('[data-preview-area]')!;
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  let current: HistoryPoint | undefined;
  let controller: AbortController | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let historyFetchedAt = 0;

  function draw() {
    const paths = previewPaths(history, current);
    line.setAttribute('d', paths.line);
    area.setAttribute('d', paths.area);
  }

  async function getJson(url: string, signal: AbortSignal) {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), cache: 'no-store' });
    if (!response.ok) throw new Error('Price request failed');
    const body = await response.json();
    if (!Array.isArray(body.error) || body.error.length || !body.result) throw new Error('Invalid price response');
    return body.result as Record<string, unknown>;
  }

  async function refresh() {
    if (stopped || document.hidden || !navigator.onLine || controller) return;
    const request = new AbortController();
    controller = request;
    const active = () => !stopped && !request.signal.aborted && !document.hidden && navigator.onLine;
    const ticker = (async () => {
      try {
        const result = await getJson('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', request.signal);
        const entry = Object.values(result)[0] as { c?: string[] } | undefined;
        const value = Number(entry?.c?.[0]);
        if (!Number.isFinite(value) || value <= 0) throw new Error('Missing price');
        if (!active()) return;
        current = { time: Date.now(), price: value };
        price.textContent = money.format(value);
        const updated = `${copy.updated}: ${date.format(current.time)}`;
        price.setAttribute('aria-label', `${copy.price}: ${money.format(value)} USD. ${updated}`);
        price.title = updated;
        status.hidden = true;
        draw();
      } catch {
        if (active()) { status.textContent = copy.unavailable; status.hidden = false; }
      }
    })();
    const recent = (async () => {
      if (Date.now() - historyFetchedAt < 15 * 60_000) return;
      try {
        const since = Math.floor(history.at(-1)!.at(-1)!.time / 1000) - 86_400;
        const result = await getJson(`https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since=${since}`, request.signal);
        const points = parseCandles(result);
        if (!active()) return;
        history = mergePreviewHistory(history, points);
        historyFetchedAt = Date.now();
        const last = points.at(-1)!;
        historyStatus.hidden = Date.now() - last.time < 2 * DAY_MS;
        draw();
      } catch {
        if (active()) historyStatus.hidden = false;
      }
    })();
    await Promise.allSettled([ticker, recent]);
    if (controller === request) controller = undefined;
  }

  function pause() {
    clearInterval(timer); timer = undefined;
    controller?.abort(); controller = undefined;
  }
  function resume() {
    if (stopped || document.hidden || !navigator.onLine) return;
    if (timer === undefined) timer = setInterval(() => { void refresh(); }, 60_000);
    void refresh();
  }
  function visibility() { if (document.hidden) pause(); else resume(); }
  function offline() { pause(); status.textContent = copy.unavailable; status.hidden = false; }
  function pagehide(event: PageTransitionEvent) { if (event.persisted) pause(); else stop(); }
  function stop() {
    if (stopped) return;
    stopped = true; pause();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('online', resume);
    window.removeEventListener('offline', offline);
    window.removeEventListener('pagehide', pagehide);
    window.removeEventListener('pageshow', resume);
  }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('online', resume);
  window.addEventListener('offline', offline);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('pageshow', resume);
  if (!navigator.onLine) offline();
  resume();
  return stop;
}
