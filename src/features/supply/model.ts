export const BITCOIN_MAX = 21_000_000;
export const SATOSHIS_PER_BTC = 100_000_000;
export const DAY_MS = 86_400_000;
export const MAX_PROJECTION_DAYS = 90;
export const MAX_SCENARIO_YEARS = 15;

export const FIAT_UNITS = {
  usd: { currency: 'USD', aggregate: 'M2', multiplier: 1e9, sourceUnit: 'billions', basis: 'Monthly average', adjustment: 'Seasonally adjusted', series: 'M2SL' },
  eur: { currency: 'EUR', aggregate: 'M2', multiplier: 1e6, sourceUnit: 'millions', basis: 'End of month', adjustment: 'Seasonally and working-day adjusted', series: 'BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E' },
  jpy: { currency: 'JPY', aggregate: 'M2', multiplier: 1e8, sourceUnit: 'hundred millions', basis: 'Monthly average', adjustment: 'Not seasonally adjusted', series: "MD02'MAM1NAM2M2MO" },
  cny: { currency: 'CNY', aggregate: 'M2', multiplier: 1e12, sourceUnit: 'trillions', basis: 'End of month', adjustment: 'Not seasonally adjusted', series: 'PBC Financial Statistics Report · M2' },
  gbp: { currency: 'GBP', aggregate: 'M4ex', multiplier: 1e9, sourceUnit: 'billions', basis: 'End of month', adjustment: 'Seasonally adjusted', series: 'B53Q · Table J' },
} as const;
export type FiatId = keyof typeof FIAT_UNITS;
export interface MoneyObservation { month: string; amount: number }
export interface MoneySnapshot {
  id: FiatId;
  currency: string;
  series: string;
  aggregate: 'M2' | 'M4ex';
  adjustment: string;
  basis: 'Monthly average' | 'End of month';
  sourceUnit: string;
  sourceMultiplier: number;
  latest: MoneyObservation;
  previousYear: MoneyObservation;
  releasedAt: string;
  checkedAt: string;
  source: string;
  dataSource: string;
  previousDataSource: string;
  definitionSource: string;
  note: string;
}
export interface SupplySnapshot {
  checkedAt: string;
  gold: GoldSnapshot;
  fiat: MoneySnapshot[];
  population: {
    persons: number;
    date: string;
    points: { date: string; persons: number }[];
    // Kept separate so today's bounded population model is unchanged.
    scenarioPoints: { date: string; persons: number }[];
    checkedAt: string;
    revision: string;
    variant: string;
    source: string;
    download: string;
  };
}

export interface GoldSnapshot {
  stock: { tonnes: number; date: string; releasedAt: string; roundedToTonnes: number; source: string };
  mineProduction: { tonnes: number; year: number; releasedAt: string; source: string };
  checkedAt: string;
}

function utcDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

export function goldAnchor(gold: GoldSnapshot): number {
  // A quarter-end observation becomes the starting stock at the next UTC day.
  return utcDate(gold.stock.date) + DAY_MS;
}

export function goldExpiry(gold: GoldSnapshot): number {
  // Quarterly stock publications lag their observation; bound this model from
  // publication rather than extending an old quarterly baseline indefinitely.
  return utcDate(gold.stock.releasedAt) + MAX_PROJECTION_DAYS * DAY_MS;
}

export function isValidGold(gold: GoldSnapshot | undefined): gold is GoldSnapshot {
  if (!gold?.stock || !gold.mineProduction) return false;
  const { stock, mineProduction: mining } = gold;
  const date = utcDate(stock.date), release = utcDate(stock.releasedAt), checked = utcDate(gold.checkedAt);
  return Number.isFinite(date) && /-(03-31|06-30|09-30|12-31)$/.test(stock.date)
    && Number.isFinite(stock.tonnes) && stock.tonnes > 0
    && Number.isFinite(stock.roundedToTonnes) && stock.roundedToTonnes > 0
    && Number.isInteger(mining.year) && mining.year >= 1900 && mining.year <= Number(stock.date.slice(0, 4))
    && Number.isFinite(mining.tonnes) && mining.tonnes >= 0
    && Number.isFinite(release) && release >= goldAnchor(gold)
    && Number.isFinite(utcDate(mining.releasedAt)) && utcDate(mining.releasedAt) >= Date.UTC(mining.year + 1, 0, 1)
    && utcDate(mining.releasedAt) <= release
    && Number.isFinite(checked) && checked >= release
    && [stock.source, mining.source].every(url => /^https:\/\/www\.gold\.org\//.test(url));
}

export function annualMiningRate(gold: GoldSnapshot): number {
  const year = gold.mineProduction.year;
  // New metal mined during the year, not the year-on-year change in output.
  return gold.mineProduction.tonnes / ((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 1_000);
}

export function projectGold(gold: GoldSnapshot | undefined, now: number): { tonnes: number | null; state: ProjectionState } {
  if (!isValidGold(gold) || !Number.isFinite(now)) return { tonnes: null, state: 'unavailable' };
  const recorded = gold.stock.tonnes;
  if (now < utcDate(gold.stock.releasedAt)) return { tonnes: recorded, state: 'recorded' };
  if (now > goldExpiry(gold)) return { tonnes: recorded, state: 'stale' };
  const tonnes = recorded + annualMiningRate(gold) * (now - goldAnchor(gold)) / 1_000;
  if (!Number.isFinite(tonnes) || tonnes <= 0) return { tonnes: recorded, state: 'stale' };
  return { tonnes, state: 'projected' };
}

export function goldShareGrams(tonnes: number, population: number): number {
  return equalShare(tonnes * 1_000_000, population);
}

function populationTime(date: string): number {
  // The source column is explicitly July 1, not January 1 or year-end.
  return /^\d{4}-07-01$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
}

export function isValidPopulation(population: SupplySnapshot['population']): boolean {
  const { points } = population;
  return Array.isArray(points) && points.length >= 2
    && points.every((point, index) => Number.isSafeInteger(point.persons) && point.persons > 0
      && Number.isFinite(populationTime(point.date))
      && (index === 0 || Number(point.date.slice(0, 4)) === Number(points[index - 1].date.slice(0, 4)) + 1))
    && points.some((point) => point.date === population.date && point.persons === population.persons);
}

export type PopulationState = 'estimated' | 'snapshot' | 'unavailable';
export interface PopulationProjection {
  persons: number | null;
  state: PopulationState;
  // Net change per second in the active annual interval; can be negative.
  rate: number;
  date?: string;
}

export function projectPopulation(snapshot: SupplySnapshot, now: number): PopulationProjection {
  const population = snapshot.population;
  if (!isValidPopulation(population) || !Number.isFinite(now)) return { persons: null, state: 'unavailable', rate: 0 };
  const first = population.points[0];
  const last = population.points.at(-1)!;
  if (now < populationTime(first.date) || now > populationTime(last.date)) {
    const point = now < populationTime(first.date) ? first : last;
    return { persons: point.persons, state: 'snapshot', rate: 0, date: point.date };
  }
  for (let index = 1; index < population.points.length; index++) {
    const end = population.points[index];
    if (now < populationTime(end.date) || index === population.points.length - 1) {
      const start = population.points[index - 1];
      const elapsed = now - populationTime(start.date);
      const duration = populationTime(end.date) - populationTime(start.date);
      const change = end.persons - start.persons;
      return { persons: start.persons + change * elapsed / duration, state: 'estimated', rate: change / (duration / 1_000) };
    }
  }
  return { persons: null, state: 'unavailable', rate: 0 };
}

export function monthStart(month: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NaN;
  return Date.parse(`${month}-01T00:00:00Z`);
}

// A monthly average has no exact instant. The following month's start is an
// explicit modeling convention, not a claim about M2 at midnight that day.
export function projectionAnchor(month: string): number {
  const start = monthStart(month);
  if (!Number.isFinite(start)) return NaN;
  const date = new Date(start);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

export function isValidMoney(money: MoneySnapshot): boolean {
  const unit = FIAT_UNITS[money.id];
  const latest = monthStart(money.latest.month);
  const prior = monthStart(money.previousYear.month);
  return !!unit && money.currency === unit.currency && money.aggregate === unit.aggregate
    && money.sourceMultiplier === unit.multiplier
    && money.sourceUnit === unit.sourceUnit && money.basis === unit.basis
    && money.adjustment === unit.adjustment && money.series === unit.series
    && Number.isFinite(latest) && Number.isFinite(prior)
    && money.latest.month.slice(5) === money.previousYear.month.slice(5)
    && Number(money.latest.month.slice(0, 4)) - Number(money.previousYear.month.slice(0, 4)) === 1
    && Number.isSafeInteger(money.latest.amount) && money.latest.amount > 0
    && Number.isSafeInteger(money.previousYear.amount) && money.previousYear.amount > 0
    && Number.isFinite(Date.parse(money.releasedAt))
    && Date.parse(money.releasedAt) >= projectionAnchor(money.latest.month)
    && Number.isFinite(Date.parse(money.checkedAt))
    && Date.parse(money.checkedAt) >= Date.parse(money.releasedAt)
    && [money.source, money.dataSource, money.previousDataSource, money.definitionSource].every((url) => /^https:\/\//.test(url));
}

export function isValidSnapshot(snapshot: SupplySnapshot): boolean {
  return snapshot.fiat.length === Object.keys(FIAT_UNITS).length
    && new Set(snapshot.fiat.map(({ id }) => id)).size === snapshot.fiat.length
    && snapshot.fiat.every(isValidMoney) && isValidPopulation(snapshot.population) && isValidGold(snapshot.gold)
    && isValidPopulation({ ...snapshot.population, points: snapshot.population.scenarioPoints })
    && Number.isFinite(Date.parse(snapshot.checkedAt));
}

export function annualRate(money: MoneySnapshot): number {
  const { latest, previousYear } = money;
  return (latest.amount - previousYear.amount)
    / ((projectionAnchor(latest.month) - projectionAnchor(previousYear.month)) / 1_000);
}

export type ProjectionState = 'projected' | 'stale' | 'recorded' | 'unavailable';
export function projectMoney(money: MoneySnapshot, now: number): { amount: number | null; state: ProjectionState } {
  if (!isValidMoney(money) || !Number.isFinite(now)) return { amount: null, state: 'unavailable' };
  const recorded = money.latest.amount;
  const anchor = projectionAnchor(money.latest.month);
  if (now < Date.parse(money.releasedAt)) return { amount: recorded, state: 'recorded' };
  if (now > anchor + MAX_PROJECTION_DAYS * DAY_MS) return { amount: recorded, state: 'stale' };
  const amount = recorded + annualRate(money) * Math.max(0, now - anchor) / 1_000;
  // Never silently clamp an invalid projection into a fabricated observation.
  if (!Number.isFinite(amount) || amount <= 0) return { amount: recorded, state: 'stale' };
  return { amount, state: 'projected' };
}

// Future mode is an explicit conditional scenario, never an extension of the
// bounded live counters. Calendar anniversaries retain the shared UTC clock;
// Feb 29 clamps to
// Feb 28 in non-leap years, avoiding JavaScript's rollover to March.
export function scenarioDate(visitAt: number, years: number): number {
  if (!Number.isFinite(visitAt) || !Number.isInteger(years) || years < 1 || years > MAX_SCENARIO_YEARS) return NaN;
  const visit = new Date(visitAt);
  const year = visit.getUTCFullYear() + years, month = visit.getUTCMonth();
  const day = Math.min(visit.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return Date.UTC(year, month, day, visit.getUTCHours(), visit.getUTCMinutes(), visit.getUTCSeconds(), visit.getUTCMilliseconds());
}

export function projectScenarioPopulation(snapshot: SupplySnapshot, at: number): PopulationProjection {
  const result = projectPopulation({ ...snapshot, population: { ...snapshot.population, points: snapshot.population.scenarioPoints } }, at);
  // Never silently substitute an endpoint population for a future date.
  return result.state === 'estimated' ? result : { persons: null, state: 'unavailable', rate: 0 };
}

export function scenarioPopulation(snapshot: SupplySnapshot, at: number): number | null {
  return projectScenarioPopulation(snapshot, at).persons;
}

export function scenarioMoney(money: MoneySnapshot, at: number): number | null {
  if (!isValidMoney(money) || !Number.isFinite(at) || at < Date.parse(money.releasedAt)) return null;
  const amount = money.latest.amount + annualRate(money) * (at - projectionAnchor(money.latest.month)) / 1_000;
  // A negative-rate scenario can exhaust its stock; no invented zero or
  // recorded fallback should be presented as an estimate for that date.
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function scenarioGold(gold: GoldSnapshot, at: number): number | null {
  if (!isValidGold(gold) || !Number.isFinite(at) || at < utcDate(gold.stock.releasedAt)) return null;
  const tonnes = gold.stock.tonnes + annualMiningRate(gold) * (at - goldAnchor(gold)) / 1_000;
  return Number.isFinite(tonnes) && tonnes > 0 ? tonnes : null;
}

export function equalShare(total: number, population: number): number {
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(population) || population <= 0) return NaN;
  return total / population;
}

export function formatNumber(value: number, locale: string, digits = 0): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatDate(value: string, locale: string, monthOnly = false): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'long', ...(monthOnly ? {} : { day: 'numeric' as const }), timeZone: 'UTC',
  }).format(new Date(monthOnly ? `${value}-01T00:00:00Z` : value));
}

export function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
