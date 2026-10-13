import { DAY_MS, type HistoryPoint } from './bitcoin-chart';

// Keep this list aligned with Currency in the Android app's app_enums.dart.
export const currencies = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY'] as const;
export type Currency = typeof currencies[number];
export const isCurrency = (value: unknown): value is Currency => currencies.some(code => code === value);

export interface ExchangeRate { time: number; rate: number }
const refreshAfter = 60 * 60_000;
const maximumAge = 7 * DAY_MS;
const api = 'https://api.frankfurter.dev/v2/providers/ecb/rates';

export function parseExchangeRates(body: unknown, currency: Currency): ExchangeRate[] {
  if (!Array.isArray(body)) throw new Error('Invalid exchange-rate response');
  const rates = new Map<number, ExchangeRate>();
  for (const row of body) {
    if (!row || row.base !== 'USD' || !isCurrency(row.quote) || typeof row.date !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || typeof row.rate !== 'number'
      || !Number.isFinite(row.rate) || row.rate <= 0) throw new Error('Invalid exchange rate');
    const time = Date.parse(`${row.date}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== row.date) throw new Error('Invalid exchange-rate date');
    if (row.quote === currency) rates.set(time, { time, rate: row.rate });
  }
  if (!rates.size) throw new Error('Missing exchange rates');
  return [...rates.values()].sort((a, b) => a.time - b.time);
}

export function exchangeRateAt(rates: ExchangeRate[], time: number): ExchangeRate | undefined {
  let low = 0;
  let high = rates.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (rates[mid].time <= time) low = mid + 1;
    else high = mid;
  }
  const rate = rates[low - 1];
  return rate && time - rate.time <= maximumAge ? rate : undefined;
}

export function convertHistory(points: HistoryPoint[], rates: ExchangeRate[]): HistoryPoint[] | undefined {
  const converted: HistoryPoint[] = [];
  for (const point of points) {
    const rate = exchangeRateAt(rates, point.time);
    if (!rate) return undefined;
    converted.push({ time: point.time, price: point.price * rate.rate });
  }
  return converted;
}

export class CurrencyRates {
  private latest = new Map<Currency, ExchangeRate>();
  private latestUpdated = 0;
  private history = new Map<Currency, { points: ExchangeRate[]; updated: number }>();
  private requests = new Map<string, Promise<void>>();
  private conversions = new WeakMap<HistoryPoint[], Map<Currency, { rates: ExchangeRate[]; points: HistoryPoint[] | undefined }>>();

  needsRefresh(currency: Currency, now = Date.now()): boolean {
    if (currency === 'USD') return false;
    const history = this.history.get(currency);
    return !this.latestUpdated || now - this.latestUpdated >= refreshAfter || !history || now - history.updated >= refreshAfter;
  }

  current(currency: Currency, now = Date.now()): ExchangeRate | undefined {
    if (currency === 'USD') return { time: now, rate: 1 };
    const rate = this.latest.get(currency);
    return rate && now >= rate.time && now - rate.time <= maximumAge ? rate : undefined;
  }

  convert(points: HistoryPoint[], currency: Currency): HistoryPoint[] | undefined {
    if (currency === 'USD') return points;
    const history = this.history.get(currency);
    if (!history) return undefined;
    const cached = this.conversions.get(points)?.get(currency);
    if (cached?.rates === history.points) return cached.points;
    const converted = convertHistory(points, history.points);
    const currencies = this.conversions.get(points) ?? new Map();
    currencies.set(currency, { rates: history.points, points: converted });
    this.conversions.set(points, currencies);
    return converted;
  }

  private request(key: string, params: Record<string, string>, apply: (body: unknown) => void): Promise<void> {
    const pending = this.requests.get(key);
    if (pending) return pending;
    const request = (async () => {
      const response = await fetch(`${api}?${new URLSearchParams({ base: 'USD', ...params })}`, {
        signal: AbortSignal.timeout(25_000), cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error(`Exchange-rate API: ${response.status}`);
      apply(await response.json());
    })().finally(() => { this.requests.delete(key); });
    this.requests.set(key, request);
    return request;
  }

  refreshLatest(now = Date.now()): Promise<void> {
    if (this.latestUpdated && now - this.latestUpdated < refreshAfter) return Promise.resolve();
    return this.request('latest', { quotes: currencies.slice(1).join(',') }, body => {
      const latest = new Map<Currency, ExchangeRate>();
      for (const currency of currencies.slice(1)) {
        const rate = parseExchangeRates(body, currency).at(-1)!;
        if (rate.time > now || now - rate.time > maximumAge) throw new Error('Outdated exchange rates');
        latest.set(currency, rate);
      }
      this.latest = latest;
      this.latestUpdated = now;
    });
  }

  refreshHistory(currency: Currency, start: number, now = Date.now()): Promise<void> {
    if (currency === 'USD') return Promise.resolve();
    const cached = this.history.get(currency);
    if (cached && now - cached.updated < refreshAfter) return Promise.resolve();
    const from = Math.max(start - maximumAge, (cached?.points.at(-1)?.time ?? start) - maximumAge);
    return this.request(`history:${currency}`, {
      quotes: currency,
      from: new Date(from).toISOString().slice(0, 10),
      to: new Date(now).toISOString().slice(0, 10),
    }, body => {
      const incoming = parseExchangeRates(body, currency);
      if (incoming.some(rate => rate.time > now)) throw new Error('Future exchange rate');
      const merged = new Map((cached?.points ?? []).map(rate => [rate.time, rate]));
      for (const rate of incoming) merged.set(rate.time, rate);
      this.history.set(currency, { points: [...merged.values()].sort((a, b) => a.time - b.time), updated: now });
    });
  }
}
