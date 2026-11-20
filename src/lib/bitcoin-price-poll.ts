import type { HistoryPoint } from './bitcoin-chart';

export const PRICE_POLL_MS = 60_000;

/** `updated` follows a successful request; `unavailable` keeps the last quote after a failed one. */
export type PricePollState = 'connecting' | 'updated' | 'unavailable';

export interface PricePollSubscriber {
  onPrice: (point: HistoryPoint) => void;
  onState: (state: PricePollState) => void;
}

const subscribers = new Set<PricePollSubscriber>();
let latest: HistoryPoint | undefined;
let state: PricePollState = 'connecting';
let timer: ReturnType<typeof setInterval> | undefined;
let controller: AbortController | undefined;

async function poll() {
  if (controller || !subscribers.size || document.hidden || !navigator.onLine) return;
  const request = new AbortController();
  controller = request;
  let point: HistoryPoint | undefined;
  try {
    const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]), cache: 'no-store',
    });
    if (!response.ok) throw new Error('Price request failed');
    const body = await response.json();
    if (!Array.isArray(body.error) || body.error.length || !body.result) throw new Error('Invalid price response');
    const entry = Object.values(body.result)[0] as { c?: string[] } | undefined;
    const price = Number(entry?.c?.[0]);
    if (!Number.isFinite(price) || price <= 0) throw new Error('Missing price');
    point = { time: Date.now(), price };
  } catch {
    // The last real quote stays visible; no price is invented for the gap.
  } finally {
    if (controller === request) controller = undefined;
  }
  // Released, hidden or offline pages discard in-flight results.
  if (request.signal.aborted || !subscribers.size || document.hidden || !navigator.onLine) return;
  if (point) latest = point;
  state = point ? 'updated' : 'unavailable';
  for (const subscriber of [...subscribers]) {
    if (point) subscriber.onPrice(point);
    subscriber.onState(state);
  }
}

/**
 * One BTC/USD poll per page, shared so every card shows the same quote at the same moment.
 * Subscribers release it while hidden, offscreen or offline; polling stops when none remain.
 */
export function subscribeBitcoinPricePoll(subscriber: PricePollSubscriber): () => void {
  subscribers.add(subscriber);
  if (latest) subscriber.onPrice(latest);
  subscriber.onState(state);
  if (timer === undefined) {
    timer = setInterval(() => { void poll(); }, PRICE_POLL_MS);
    void poll();
  }
  return () => {
    if (!subscribers.delete(subscriber) || subscribers.size) return;
    clearInterval(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
  };
}
