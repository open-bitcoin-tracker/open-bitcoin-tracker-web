import { FIAT_UNITS, isValidMoney, isValidSnapshot, monthStart, type FiatId, type MoneySnapshot, type SupplySnapshot } from './model.ts';

const months: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
type Observations = Pick<MoneySnapshot, 'latest' | 'previousYear' | 'releasedAt'>;

/** Fail closed when the Fed's series headers or table layout change. */
export function parseH6(html: string): Observations {
  const release = html.match(/Release Date:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/);
  if (!release || !Number.isFinite(Date.parse(`${release[1]} UTC`))) throw new Error('Missing H.6 release date.');
  const header = html.match(/<th\b[^>]*id="t1tg1b2"[^>]*>([\s\S]*?)<\/th>/);
  if (!header || !/^\s*M2(?:\s|$)/.test(header[1].replace(/<[^>]+>/g, ' '))) throw new Error('Missing expected M2 header.');
  const observations: MoneySnapshot['latest'][] = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const month = row[1].match(/<th\b[^>]*id="t1tg1r\d+"[^>]*>\s*([A-Za-z]+)\.?\s+(\d{4})\s*<\/th>/i);
    const m2 = row[1].match(/<td\b[^>]*headers="t1tg1a2 t1tg1b2 t1tg1r\d+"[^>]*>\s*([\d,]+\.\d+)\s*<\/td>/i);
    if (!month || !m2 || !months[month[1].slice(0, 3)]) continue;
    observations.push({ month: `${month[2]}-${months[month[1].slice(0, 3)]}`, amount: scaleSource(Number(m2[1].replaceAll(',', '')), 1e9) });
  }
  observations.sort((a, b) => monthStart(a.month) - monthStart(b.month));
  const latest = observations.at(-1);
  if (!latest) throw new Error('Missing seasonally adjusted monthly M2 observations.');
  const priorMonth = `${Number(latest.month.slice(0, 4)) - 1}${latest.month.slice(4)}`;
  const previousYear = observations.find(({ month }) => month === priorMonth);
  if (!previousYear) throw new Error('Missing the same-month observation one year earlier.');
  return { latest, previousYear, releasedAt: new Date(`${release[1]} UTC`).toISOString().slice(0, 10) };
}

export function scaleSource(value: number, multiplier: number): number {
  const amount = Math.round(value * multiplier);
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid source amount.');
  return amount;
}

export function replaceMoney(current: SupplySnapshot, money: MoneySnapshot, checkedAt: string): SupplySnapshot {
  const previous = current.fiat.find(({ id }) => id === money.id);
  if (!previous || !isValidMoney(money)) throw new Error('Invalid monetary import.');
  if (money.latest.month < previous.latest.month || money.releasedAt < previous.releasedAt) throw new Error('Refusing an older release.');
  const next = { ...current, checkedAt, fiat: current.fiat.map((entry) => entry.id === money.id ? money : entry) };
  if (!isValidSnapshot(next)) throw new Error('Refreshed data failed validation.');
  return next;
}

export function refreshedSnapshot(current: SupplySnapshot, html: string, checkedAt: string): SupplySnapshot {
  const usd = current.fiat.find(({ id }) => id === 'usd')!;
  return replaceMoney(current, { ...usd, ...parseH6(html), checkedAt }, checkedAt);
}

export interface ReviewedMoneyImport {
  id: FiatId;
  sourceMultiplier: number;
  latest: { month: string; value: number };
  previousYear: { month: string; value: number };
  releasedAt: string;
  source: string;
  dataSource: string;
  previousDataSource: string;
  definitionSource: string;
  note: string;
}

/** Source review is manual. This validates units/windows; it does not authenticate data. */
export function importReviewedMoney(current: SupplySnapshot, entries: ReviewedMoneyImport[], checkedAt: string): SupplySnapshot {
  if (!Array.isArray(entries) || !entries.length || new Set(entries.map(({ id }) => id)).size !== entries.length) throw new Error('Invalid import list.');
  let next = current;
  for (const entry of entries) {
    const previous = current.fiat.find(({ id }) => id === entry.id);
    if (!previous || entry.sourceMultiplier !== FIAT_UNITS[entry.id]?.multiplier) throw new Error('Wrong currency or source units.');
    // Preserve the selected definition, adjustment and source unit for this series.
    const money: MoneySnapshot = { ...previous, checkedAt, releasedAt: entry.releasedAt,
      source: entry.source, dataSource: entry.dataSource, previousDataSource: entry.previousDataSource, definitionSource: entry.definitionSource, note: entry.note,
      latest: { month: entry.latest.month, amount: scaleSource(entry.latest.value, entry.sourceMultiplier) },
      previousYear: { month: entry.previousYear.month, amount: scaleSource(entry.previousYear.value, entry.sourceMultiplier) },
    };
    const expectedHost = new URL(previous.source).hostname;
    if (new URL(money.source).hostname !== expectedHost) throw new Error('Release must remain on the official source host.');
    next = replaceMoney(next, money, checkedAt);
  }
  return next;
}
