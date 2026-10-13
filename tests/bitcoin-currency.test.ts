import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { DAY_MS } from '../src/lib/bitcoin-chart.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/bitcoin-currency.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(fetch: typeof globalThis.fetch = async () => { throw new Error('Unexpected fetch'); }) {
  const exports: Record<string, any> = {};
  runInNewContext(script, { exports, require: () => ({ DAY_MS }), Date, URLSearchParams, AbortSignal, fetch });
  return exports;
}
const row = (date = '2026-10-09', rate = .8, quote = 'EUR') => ({ date, base: 'USD', quote, rate });
const friday = Date.parse('2026-10-09T00:00:00Z');

test('historical conversion uses each date’s rate and carries known weekend rates without inventing gaps', () => {
  const fx = fixture();
  const rates = fx.parseExchangeRates([row(), row('2026-10-12', .9)], 'EUR');
  const points = [0, 1, 2, 3].map(day => ({ time: friday + day * DAY_MS, price: 100 }));
  assert.deepEqual(Array.from(fx.convertHistory(points, rates), (point: any) => point.price), [80, 80, 80, 90]);
  assert.equal(fx.convertHistory([{ time: friday - 1, price: 100 }], rates), undefined);
  assert.equal(fx.convertHistory([{ time: friday + 8 * DAY_MS, price: 100 }], [rates[0]]), undefined);
  assert.equal(fx.convertHistory(points, []), undefined);
});

test('exchange-rate responses reject bad dates, incorrect bases, absent currencies, and nonpositive rates', () => {
  const fx = fixture();
  for (const body of [{}, [], [row('2026-02-30')], [row('invalid')], [row('2026-10-09', 0)], [row('2026-10-09', -1)], [row('2026-10-09', NaN)], [{ ...row(), rate: '1' }], [{ ...row(), base: 'EUR' }], [row('2026-10-09', .8, 'GBP')]]) {
    assert.throws(() => fx.parseExchangeRates(body, 'EUR'));
  }
});

test('latest requests are shared, USD requires no FX request, and only the selected history is downloaded', async () => {
  const requests: URL[] = [];
  const fx = fixture((async (url: string) => {
    const query = new URL(url);
    requests.push(query);
    const quotes = query.searchParams.get('quotes')!.split(',');
    return { ok: true, json: async () => quotes.map(quote => row('2026-10-09', .8, quote)) };
  }) as typeof fetch);
  const rates = new fx.CurrencyRates();
  const now = friday + 12 * 60 * 60_000;
  assert.equal(rates.needsRefresh('USD', now), false);
  assert.equal(rates.needsRefresh('EUR', now), true);
  assert.equal(rates.current('USD', now).rate, 1);
  await rates.refreshHistory('USD', friday, now);
  assert.equal(requests.length, 0);
  await Promise.all([rates.refreshLatest(now), rates.refreshLatest(now)]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get('quotes'), 'EUR,GBP,AUD,CAD,CHF,JPY');
  await rates.refreshHistory('EUR', friday, now);
  assert.equal(rates.needsRefresh('EUR', now + 60_000), false);
  assert.equal(rates.needsRefresh('EUR', now + 60 * 60_000), true);
  assert.equal(requests[1].searchParams.get('quotes'), 'EUR');
  const points = [{ time: friday, price: 100 }];
  const converted = rates.convert(points, 'EUR');
  assert.equal(converted[0].price, 80);
  assert.equal(rates.convert(points, 'EUR'), converted, 'reuse converted history between ticker updates');
  await rates.refreshLatest(now + 60_000);
  await rates.refreshHistory('EUR', friday, now + 60_000);
  assert.equal(requests.length, 2);
  assert.equal(rates.current('EUR', friday + 8 * DAY_MS), undefined, 'expired FX is unavailable');
  assert.equal(rates.current('EUR', friday - DAY_MS), undefined, 'future FX is unavailable');
});

test('incremental updates preserve history and request only a recent overlap; failed refreshes preserve usable rates', async () => {
  const requests: URL[] = [];
  let fail = false;
  const fx = fixture((async (url: string) => {
    const query = new URL(url);
    requests.push(query);
    const quotes = query.searchParams.get('quotes')!.split(',');
    const dates = requests.length <= 2 ? ['2026-10-09'] : ['2026-10-12'];
    return { ok: !fail, status: 503, json: async () => dates.flatMap(date => quotes.map(quote => row(date, date.endsWith('09') ? .8 : .9, quote))) };
  }) as typeof fetch);
  const rates = new fx.CurrencyRates();
  const start = Date.parse('2010-07-17T00:00:00Z');
  await rates.refreshLatest(friday);
  await rates.refreshHistory('EUR', start, friday);
  await rates.refreshHistory('EUR', start, friday + 3 * DAY_MS);
  assert.equal(requests[2].searchParams.get('from'), '2026-10-02');
  const points = [{ time: friday, price: 100 }, { time: friday + 3 * DAY_MS, price: 100 }];
  assert.deepEqual(Array.from(rates.convert(points, 'EUR'), (point: any) => point.price), [80, 90]);
  fail = true;
  await assert.rejects(rates.refreshLatest(friday + 3 * DAY_MS));
  assert.equal(rates.current('EUR', friday + 3 * DAY_MS).rate, .8);
  await assert.rejects(rates.refreshHistory('GBP', start, friday + 3 * DAY_MS));
  assert.equal(rates.convert(points, 'GBP'), undefined);
});
