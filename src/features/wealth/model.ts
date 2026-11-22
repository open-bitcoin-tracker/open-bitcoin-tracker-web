import type { SupplySnapshot } from '../supply/model';

export const ASSET_IDS = ['realEstate', 'bonds', 'equities', 'fiat', 'gold', 'silver', 'bitcoin'] as const;
export type AssetId = typeof ASSET_IDS[number];
export type SnapshotAssetId = 'realEstate' | 'bonds' | 'equities';
export type AssetValues = Record<AssetId, number>;

export interface WealthSnapshot {
  checkedAt: string;
  bitcoin: { referenceHeight: number; referenceTime: string; fallbackPrice: number; fallbackPriceDate: string; source: string };
  gold: { tonnes: number; asOf: string; source: string; fallbackPrice: number; fallbackPriceDate: string; note: string };
  silver: { ounces: number; asOf: string; source: string; fallbackPrice: number; fallbackPriceDate: string; note: string };
  fiat: { fxDate: string; usdRates: Record<'EUR' | 'JPY' | 'CNY' | 'GBP', number>; fxSource: string };
  assets: { id: SnapshotAssetId; valueUsd: number; asOf: string; publisher: string; source: string; note: string }[];
}

export const GRAMS_PER_TROY_OUNCE = 31.1034768;
export const BLOCK_INTERVAL_MS = 600_000;
export const HALVING_INTERVAL = 210_000;
export const INITIAL_SUBSIDY = 50;
export const SLIDER_STEPS = 1000;

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isoDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value));
const url = (value: unknown) => typeof value === 'string' && value.startsWith('https://');

export function isValidWealthSnapshot(snapshot: WealthSnapshot): boolean {
  const { bitcoin, gold, silver, fiat, assets } = snapshot;
  return isoDate(snapshot.checkedAt)
    && Number.isInteger(bitcoin.referenceHeight) && bitcoin.referenceHeight > 0 && isoDate(bitcoin.referenceTime)
    && positive(bitcoin.fallbackPrice) && isoDate(bitcoin.fallbackPriceDate) && url(bitcoin.source)
    && positive(gold.tonnes) && isoDate(gold.asOf) && url(gold.source) && positive(gold.fallbackPrice) && isoDate(gold.fallbackPriceDate)
    && !!silver && positive(silver.ounces) && isoDate(silver.asOf) && url(silver.source) && positive(silver.fallbackPrice) && isoDate(silver.fallbackPriceDate)
    && isoDate(fiat.fxDate) && url(fiat.fxSource) && (['EUR', 'JPY', 'CNY', 'GBP'] as const).every((code) => positive(fiat.usdRates[code]))
    && assets.length === 3 && new Set(assets.map(({ id }) => id)).size === 3
    && assets.every((asset) => ['realEstate', 'bonds', 'equities'].includes(asset.id) && positive(asset.valueUsd) && isoDate(asset.asOf) && url(asset.source) && !!asset.publisher);
}

/** Coins issued through `height`, genesis block included, as most market-cap sources count them. */
export function circulatingSupply(height: number): number {
  if (!Number.isFinite(height) || height < 0) return NaN;
  let remaining = Math.floor(height) + 1;
  let subsidy = INITIAL_SUBSIDY;
  let supply = 0;
  while (remaining > 0 && subsidy >= 1e-8) {
    const blocks = Math.min(remaining, HALVING_INTERVAL);
    supply += blocks * subsidy;
    remaining -= blocks;
    subsidy /= 2;
  }
  return supply;
}

/** Ten-minute blocks since the reviewed reference block; never earlier than the reference. */
export function estimateHeight(bitcoin: WealthSnapshot['bitcoin'], now: number): number {
  const elapsed = now - Date.parse(bitcoin.referenceTime);
  if (!Number.isFinite(elapsed)) return bitcoin.referenceHeight;
  return bitcoin.referenceHeight + Math.max(0, Math.floor(elapsed / BLOCK_INTERVAL_MS));
}

export function goldOunces(tonnes: number): number {
  return tonnes * 1_000_000 / GRAMS_PER_TROY_OUNCE;
}

/** Recorded broad money for the five supply-page currencies, converted at one ECB reference date. */
export function broadMoneyUsd(supply: SupplySnapshot, rates: WealthSnapshot['fiat']['usdRates']): number {
  return supply.fiat.reduce((total, money) => {
    const rate = money.currency === 'USD' ? 1 : rates[money.currency as keyof typeof rates];
    return positive(rate) ? total + money.latest.amount / rate : NaN;
  }, 0);
}

export function baseValues(snapshot: WealthSnapshot, fiat: number, bitcoinPrice: number, goldPrice: number, silverPrice: number, supply: number): AssetValues {
  const listed = Object.fromEntries(snapshot.assets.map(({ id, valueUsd }) => [id, valueUsd])) as Record<SnapshotAssetId, number>;
  return { ...listed, fiat, gold: goldOunces(snapshot.gold.tonnes) * goldPrice, silver: snapshot.silver.ounces * silverPrice, bitcoin: bitcoinPrice * supply };
}

export function totalValue(values: AssetValues): number {
  return ASSET_IDS.reduce((sum, id) => sum + values[id], 0);
}

/**
 * Bitcoin takes its new market cap from the other assets in proportion to their size;
 * the total stays fixed, and a lower market cap returns value the same way.
 */
export function redistribute(base: AssetValues, bitcoinCap: number): AssetValues {
  const total = totalValue(base);
  const target = Math.min(total, Math.max(0, bitcoinCap));
  const others = total - base.bitcoin;
  const factor = others > 0 ? (total - target) / others : 0;
  const next = { bitcoin: target } as AssetValues;
  for (const id of ASSET_IDS) if (id !== 'bitcoin') next[id] = base[id] * factor;
  return next;
}

/** The slider is logarithmic, from today's market cap (it can only grow) up to all global wealth. */
export function capFromPosition(position: number, min: number, max: number): number {
  const ratio = Math.min(1, Math.max(0, position / SLIDER_STEPS));
  return max <= min ? max : min * (max / min) ** ratio;
}

export function positionFromCap(cap: number, min: number, max: number): number {
  if (max <= min || cap <= min) return 0;
  if (cap >= max) return SLIDER_STEPS;
  return Math.log(cap / min) / Math.log(max / min) * SLIDER_STEPS;
}

/** Round prices per bitcoin (1–9 × a power of ten) strictly between two prices, in ascending order. */
export function priceMilestones(minPrice: number, maxPrice: number): number[] {
  const milestones: number[] = [];
  if (!(minPrice > 0) || !(maxPrice > minPrice)) return milestones;
  for (let power = 10 ** Math.floor(Math.log10(minPrice)); power < maxPrice; power *= 10) {
    for (let digit = 1; digit <= 9; digit += 1) {
      const price = digit * power;
      if (price > minPrice && price < maxPrice) milestones.push(price);
    }
  }
  return milestones;
}

/**
 * The cap for a slider position, pulled onto a round price when the position lies within
 * `snapSteps` of one, so prices like $200,000 or $1,000,000 are easy to hit. Either end of the
 * track wins over a round price next to it, so all global wealth stays reachable.
 */
export function snapCap(position: number, min: number, max: number, supply: number, snapSteps: number): { cap: number; milestone?: number } {
  let best: { price: number; distance: number } | undefined;
  for (const price of priceMilestones(min / supply, max / supply)) {
    const distance = Math.abs(positionFromCap(price * supply, min, max) - position);
    if (!best || distance < best.distance) best = { price, distance };
  }
  // The ends of the track (today, all global wealth) pull harder than any round price beside them.
  const toEnd = SLIDER_STEPS - position;
  if (position <= snapSteps && (!best || position <= best.distance)) return { cap: min };
  if (toEnd <= snapSteps && (!best || toEnd <= best.distance)) return { cap: max };
  if (best && best.distance <= snapSteps) return { cap: best.price * supply, milestone: best.price };
  return { cap: capFromPosition(position, min, max) };
}

export interface Rect { x: number; y: number; w: number; h: number }

function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max(side * side * max / (sum * sum), sum * sum / (side * side * min));
}

/**
 * Squarified treemap (Bruls, Huizing and van Wijk). Zero values get empty rectangles.
 * `first` is laid out before the others, which keeps it in the top-left corner.
 */
export function squarify<T extends string>(items: { id: T; value: number }[], width: number, height: number, first?: T): Record<T, Rect> {
  const result = {} as Record<T, Rect>;
  for (const item of items) result[item.id] = { x: 0, y: 0, w: 0, h: 0 };
  const visible = items.filter((item) => Number.isFinite(item.value) && item.value > 0).sort((a, b) => Number(b.id === first) - Number(a.id === first) || b.value - a.value);
  const total = visible.reduce((sum, item) => sum + item.value, 0);
  if (!total || width <= 0 || height <= 0) return result;
  const scale = width * height / total;
  const areas = visible.map((item) => ({ id: item.id, area: item.value * scale }));
  let free: Rect = { x: 0, y: 0, w: width, h: height };
  let row: typeof areas = [];

  const place = () => {
    const sum = row.reduce((total, item) => total + item.area, 0);
    if (free.w >= free.h) {
      const columnWidth = Math.min(free.w, sum / free.h);
      let y = free.y;
      for (const item of row) {
        const h = item.area / columnWidth;
        result[item.id] = { x: free.x, y, w: columnWidth, h };
        y += h;
      }
      free = { x: free.x + columnWidth, y: free.y, w: free.w - columnWidth, h: free.h };
    } else {
      const rowHeight = Math.min(free.h, sum / free.w);
      let x = free.x;
      for (const item of row) {
        const w = item.area / rowHeight;
        result[item.id] = { x, y: free.y, w, h: rowHeight };
        x += w;
      }
      free = { x: free.x, y: free.y + rowHeight, w: free.w, h: free.h - rowHeight };
    }
    row = [];
  };

  for (let i = 0; i < areas.length;) {
    const side = Math.min(free.w, free.h);
    const candidate = [...row, areas[i]].map((item) => item.area);
    if (!row.length || worst(candidate, side) <= worst(row.map((item) => item.area), side)) {
      row.push(areas[i]);
      i++;
    } else {
      place();
    }
  }
  if (row.length) place();
  return result;
}

/** A corner cut from a tile's top-left, in the tile's own units. */
export interface Notch { w: number; h: number }
export interface AssetLayout {
  rects: Record<AssetId, Rect>;
  /** Tiles that wrap around a square in their top-left corner (Bitcoin's, or silver's inside gold); each rectangle includes its notch. */
  notches: Partial<Record<AssetId, Notch>>;
  /** A square cut from a tile's bottom-right corner: silver, when Bitcoin already takes gold's top-left. */
  corners: Partial<Record<AssetId, Notch>>;
}

/** A tile's clip path: its rectangle minus an optional top-left notch and bottom-right corner. */
export function tileClipPath(rect: Rect, notch: Notch | undefined, corner: Notch | undefined, unit: (value: number, of: number) => string): string {
  if (!notch && !corner) return '';
  const tl = notch ?? { w: 0, h: 0 };
  const br = corner ?? { w: 0, h: 0 };
  const left = unit(tl.w, rect.w), top = unit(tl.h, rect.h);
  const right = corner ? `calc(100% - ${unit(br.w, rect.w)})` : '100%';
  const bottom = corner ? `calc(100% - ${unit(br.h, rect.h)})` : '100%';
  return `polygon(${left} 0, 100% 0, 100% ${bottom}, ${right} ${bottom}, ${right} 100%, 0 100%, 0 ${top}, ${left} ${top})`;
}

/** Assets closest in spirit to Bitcoin share its corner of the chart. */
export const MONETARY_ASSETS = ['bitcoin', 'fiat', 'gold'] as const satisfies readonly AssetId[];
/** Silver is drawn inside gold's box, so the treemap lays out the two metals as one. */
const OTHER_ASSETS = ASSET_IDS.filter((id) => id !== 'silver' && !(MONETARY_ASSETS as readonly AssetId[]).includes(id));

/** Two-level treemap: the monetary block first (top-left), then real estate, bonds and equities. */
function groupedTreemap(values: Partial<AssetValues>, monetary: readonly AssetId[], width: number, height: number): Record<AssetId, Rect> {
  const block = monetary.map((id) => ({ id, value: Math.max(0, values[id] ?? 0) }));
  const blockValue = block.reduce((sum, item) => sum + item.value, 0);
  const outer = squarify<AssetId | 'monetary'>([{ id: 'monetary', value: blockValue }, ...OTHER_ASSETS.map((id) => ({ id, value: values[id] ?? 0 }))], width, height, 'monetary');
  const area = outer.monetary;
  const inner = squarify(block, area.w, area.h, monetary[0]);
  const rects = {} as Record<AssetId, Rect>;
  for (const id of OTHER_ASSETS) rects[id] = outer[id];
  for (const { id } of block) rects[id] = { x: area.x + inner[id].x, y: area.y + inner[id].y, w: inner[id].w, h: inner[id].h };
  return rects;
}

const overlap = (rect: Rect, side: number): Notch => ({
  w: Math.max(0, Math.min(rect.x + rect.w, side) - rect.x),
  h: Math.max(0, Math.min(rect.y + rect.h, side) - rect.y),
});

/**
 * Bitcoin is a square in the top-left corner, beside fiat and gold. Every tile the square overlaps
 * wraps around it with a notch and is enlarged by exactly the area it gives up, found by iterating
 * the layout until those areas settle. If the square cannot fit, Bitcoin leads a plain treemap.
 */
function layoutCore(values: AssetValues, width: number, height: number): AssetLayout {
  const fallback = (): AssetLayout => ({ rects: groupedTreemap(values, MONETARY_ASSETS, width, height), notches: {}, corners: {} });
  const total = totalValue(values);
  if (!(values.bitcoin > 0) || !(total > 0) || width <= 0 || height <= 0) return fallback();
  const scale = width * height / total;
  const side = Math.sqrt(values.bitcoin * scale);
  if (side > Math.min(width, height) * 0.95) return fallback();
  const hosts = ASSET_IDS.filter((id) => id !== 'bitcoin' && id !== 'silver');
  const extra = Object.fromEntries(hosts.map((id) => [id, 0])) as Record<AssetId, number>;
  for (let iteration = 0; iteration < 60; iteration++) {
    const inflated = Object.fromEntries(hosts.map((id) => [id, values[id] + extra[id]])) as Partial<AssetValues>;
    const rects = groupedTreemap(inflated, ['fiat', 'gold'], width, height);
    let error = 0;
    for (const id of hosts) {
      const cut = overlap(rects[id], side);
      const covered = cut.w * cut.h / scale;
      error = Math.max(error, Math.abs(covered - extra[id]));
      extra[id] = covered;
    }
    if (error > total * 1e-9) continue;
    const notches: AssetLayout['notches'] = {};
    for (const id of hosts) {
      const cut = overlap(rects[id], side);
      if (cut.w <= 0 || cut.h <= 0) continue;
      // A tile hidden entirely under the square cannot wrap around it.
      if (cut.w >= rects[id].w - 1e-9 && cut.h >= rects[id].h - 1e-9) return fallback();
      notches[id] = cut;
    }
    rects.bitcoin = { x: 0, y: 0, w: side, h: side };
    return { rects, notches, corners: {} };
  }
  return fallback();
}

/**
 * Silver sits inside gold's box as a square in its top-left corner, so gold becomes an L shape.
 * If Bitcoin's square already cuts that corner, silver takes the bottom-right one instead; a box
 * too small for the square gives silver a strip along its bottom.
 */
function nestSilver(layout: AssetLayout, silver: number, scale: number): AssetLayout {
  const { rects, notches, corners } = layout;
  const gold = rects.gold;
  const area = Math.max(0, silver) * scale;
  if (!(area > 0) || gold.w <= 0 || gold.h <= 0) {
    rects.silver = { x: gold.x, y: gold.y, w: 0, h: 0 };
    return layout;
  }
  const side = Math.sqrt(area);
  const notch = notches.gold;
  if (side < gold.w && side < gold.h) {
    if (!notch) {
      rects.silver = { x: gold.x, y: gold.y, w: side, h: side };
      notches.gold = { w: side, h: side };
      return layout;
    }
    if (side <= gold.w - notch.w || side <= gold.h - notch.h) {
      rects.silver = { x: gold.x + gold.w - side, y: gold.y + gold.h - side, w: side, h: side };
      corners.gold = { w: side, h: side };
      return layout;
    }
  }
  const h = Math.min(gold.h, area / gold.w);
  rects.silver = { x: gold.x, y: gold.y + gold.h - h, w: gold.w, h };
  rects.gold = { ...gold, h: gold.h - h };
  return layout;
}

/**
 * Bitcoin's square leads the top-left corner (see `layoutCore`) and silver nests inside gold.
 * Every area stays proportional to its value.
 */
export function layoutAssets(values: AssetValues, width: number, height: number): AssetLayout {
  const total = totalValue(values);
  const merged = { ...values, gold: values.gold + Math.max(0, values.silver), silver: 0 };
  const layout = layoutCore(merged, width, height);
  return nestSilver(layout, values.silver, total > 0 ? width * height / total : 0);
}

const compactFormatters = new Map<number, Intl.NumberFormat>();
export function formatCompactUsd(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  let formatter = compactFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: digits });
    compactFormatters.set(digits, formatter);
  }
  return formatter.format(value);
}

const priceFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export function formatUsd(value: number): string {
  return Number.isFinite(value) ? priceFormatter.format(value) : '—';
}

const changeFormatter = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
export function formatChange(value: number): string {
  return Number.isFinite(value) ? changeFormatter.format(value).replace('-', '−') : '—';
}
