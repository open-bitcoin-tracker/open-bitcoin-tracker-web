import { subscribeBitcoinPricePoll } from '../lib/bitcoin-price-poll';
import { createOptionPicker } from '../lib/currency-picker';
import { formatDate, interpolate } from '../features/supply/model';
import { ASSET_IDS, baseValues, capFromPosition, circulatingSupply, estimateHeight, formatChange, formatCompactUsd, formatUsd, maxCap, parityCap, positionFromCap, redistribute, SLIDER_STEPS, layoutAssets, totalValue, type AssetId, type AssetValues, type Notch, type Rect, type ValueSource, type WealthSnapshot } from '../features/wealth/model';
import type { WealthCopy, assetNames } from '../i18n/wealth';

type Copy = WealthCopy & { assetNames: typeof assetNames };
type Preset = Exclude<AssetId, 'bitcoin'>;

const root = document.querySelector<HTMLElement>('[data-wealth]');
const json = document.getElementById('wealth-data');

async function fetchGoldPrice(): Promise<number | undefined> {
  try {
    const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=PAXGUSD', { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (!response.ok) return undefined;
    const body = await response.json();
    if (!Array.isArray(body.error) || body.error.length || !body.result) return undefined;
    const ticker = Object.values(body.result)[0] as { c?: string[] } | undefined;
    const price = Number(ticker?.c?.[0]);
    return Number.isFinite(price) && price > 0 ? price : undefined;
  } catch {
    return undefined;
  }
}

if (root && json) {
  const { snapshot, fiat, copy } = JSON.parse(json.textContent ?? '{}') as { snapshot: WealthSnapshot; fiat: number; copy: Copy };
  const treemap = root.querySelector<HTMLElement>('[data-treemap]')!;
  const tiles = new Map(ASSET_IDS.map((id) => {
    const tile = root.querySelector<HTMLElement>(`[data-tile="${id}"]`)!;
    return [id, { tile, body: tile.querySelector<HTMLElement>('.tile-body')!, value: tile.querySelector<HTMLElement>('[data-tile-value]')!, change: tile.querySelector<HTMLElement>('[data-tile-change]')! }];
  }));
  const slider = root.querySelector<HTMLInputElement>('[data-slider]')!;
  const priceOutput = root.querySelector<HTMLElement>('[data-price]')!;
  const totalOutput = root.querySelector<HTMLElement>('[data-total]')!;
  const callout = root.querySelector<HTMLElement>('[data-callout]')!;
  const calloutValue = root.querySelector<HTMLElement>('[data-callout-value]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const presetButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-preset]'));
  const resetButton = root.querySelector<HTMLButtonElement>('[data-reset]')!;
  const sourceSelect = root.querySelector<HTMLSelectElement>('[data-source]')!;
  const sourceDot = root.querySelector<HTMLElement>('[data-source-dot]')!;
  const multiplierOutput = root.querySelector<HTMLElement>('[data-multiplier]')!;
  const date = (value: string) => formatDate(value, 'en-US');

  let bitcoinPrice = snapshot.bitcoin.fallbackPrice;
  let goldPrice = snapshot.gold.fallbackPrice;
  let bitcoinState: 'connecting' | 'live' | 'unavailable' = 'connecting';
  let goldLive: boolean | undefined;
  // `null` follows today's live market cap; a number is the visitor's hypothetical market cap.
  let selectedCap: number | null = null;
  let activePreset: Preset | null = null;
  let source: ValueSource = null;

  const current = () => {
    const supply = circulatingSupply(estimateHeight(snapshot.bitcoin, Date.now()));
    const base = baseValues(snapshot, fiat, bitcoinPrice, goldPrice, supply);
    return { supply, base, total: totalValue(base) };
  };

  /**
   * A tile under Bitcoin's square keeps its full rectangle and cuts the square out of its corner,
   * leaving an L shape. Its label moves into the larger remaining arm.
   */
  function wrapAround(body: HTMLElement, rect: Rect, notch: Notch | undefined) {
    if (!notch) {
      body.style.removeProperty('clip-path');
      body.style.removeProperty('padding-left');
      body.style.removeProperty('padding-top');
      return;
    }
    const { w, h } = notch;
    body.style.clipPath = `polygon(${w}px 0, 100% 0, 100% 100%, 0 100%, 0 ${h}px, ${w}px ${h}px)`;
    const rightArm = w < rect.w - 1 && (h >= rect.h - 1 || (rect.w - w) * rect.h >= rect.w * (rect.h - h));
    body.style.paddingLeft = rightArm ? `calc(${w}px + .25rem)` : '';
    body.style.paddingTop = rightArm ? '' : `calc(${h}px + .25rem)`;
  }

  function layout(values: AssetValues) {
    const { width, height } = treemap.getBoundingClientRect();
    if (!width || !height) return;
    const { rects, notches } = layoutAssets(values, width, height);
    for (const id of ASSET_IDS) {
      const rect = rects[id];
      const { tile, body } = tiles.get(id)!;
      wrapAround(body, rect, notches[id]);
      tile.style.left = `${rect.x / width * 100}%`;
      tile.style.top = `${rect.y / height * 100}%`;
      tile.style.width = `${rect.w / width * 100}%`;
      tile.style.height = `${rect.h / height * 100}%`;
      tile.toggleAttribute('data-empty', rect.w <= 0 || rect.h <= 0);
    }
    // Mirror the tile label's container query: tile minus its inner padding.
    const bitcoin = rects.bitcoin;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const inset = rem * .5;
    callout.toggleAttribute('data-visible', bitcoin.w - inset <= 4 * rem || bitcoin.h - inset <= 1.25 * rem);
    callout.style.setProperty('--callout-x', `${bitcoin.w / 2}px`);
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let shown: AssetValues | undefined;
  let frame = 0;

  /**
   * Presets glide between layouts by interpolating values and laying out every frame,
   * so notches always match their boxes. Dragging and reduced motion update at once.
   */
  function draw(values: AssetValues, animate: boolean) {
    cancelAnimationFrame(frame);
    const from = shown;
    if (!animate || !from || reducedMotion.matches) {
      shown = values;
      layout(values);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 450);
      const eased = 1 - (1 - progress) ** 3;
      const current = Object.fromEntries(ASSET_IDS.map((id) => [id, from[id] + (values[id] - from[id]) * eased])) as AssetValues;
      shown = current;
      layout(current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  function render(animate = false) {
    const { supply, base, total } = current();
    const max = maxCap(base, source);
    if (activePreset) selectedCap = parityCap(base, activePreset, source);
    // Bitcoin can only grow from today's live market cap, up to what the source can fund.
    const cap = Math.min(max, Math.max(base.bitcoin, selectedCap ?? base.bitcoin));
    const simulated = selectedCap !== null;
    const values: AssetValues = simulated ? redistribute(base, cap, source) : base;
    const price = cap / supply;

    draw(values, animate);
    for (const id of ASSET_IDS) {
      const { value, change } = tiles.get(id)!;
      value.textContent = formatCompactUsd(values[id]);
      const ratio = base[id] > 0 ? values[id] / base[id] - 1 : 0;
      change.textContent = simulated && Math.abs(ratio) > 1e-9 ? formatChange(ratio) : '';
    }
    totalOutput.textContent = formatCompactUsd(total);
    calloutValue.textContent = formatCompactUsd(values.bitcoin);
    priceOutput.textContent = formatUsd(price);
    const position = Math.round(positionFromCap(cap, base.bitcoin, max));
    slider.value = String(position);
    slider.style.setProperty('--fill', `${position / SLIDER_STEPS * 100}%`);
    const times = cap / base.bitcoin;
    multiplierOutput.textContent = times > 1.0005 ? interpolate(copy.multiplier, { n: times.toLocaleString('en-US', { maximumFractionDigits: times < 10 ? 1 : 0 }) }) : '';
    slider.setAttribute('aria-valuetext', interpolate(copy.sliderValue, { cap: formatCompactUsd(cap, 4), price: formatUsd(price) }));
    for (const button of presetButtons) {
      // A preset the source cannot fund, or one Bitcoin already passes, is unavailable.
      const target = parityCap(base, button.dataset.preset as Preset, source);
      button.disabled = target === null || target <= base.bitcoin;
      button.setAttribute('aria-pressed', String(button.dataset.preset === activePreset));
    }
    resetButton.hidden = cap <= base.bitcoin;

    const lines = [
      bitcoinState === 'unavailable' ? interpolate(copy.priceUnavailable, { date: date(snapshot.bitcoin.fallbackPriceDate) }) : '',
      goldLive === false ? interpolate(copy.goldUnavailable, { date: date(snapshot.gold.fallbackPriceDate) }) : '',
    ];
    status.textContent = lines.filter(Boolean).join(' ');
  }

  slider.addEventListener('input', () => {
    const { base } = current();
    const position = Number(slider.value);
    selectedCap = position <= 0 ? null : capFromPosition(position, base.bitcoin, maxCap(base, source));
    activePreset = null;
    render();
  });
  slider.addEventListener('change', () => render());
  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      activePreset = button.dataset.preset as Preset;
      render(true);
    });
  }
  const reset = () => {
    activePreset = null;
    selectedCap = null;
    render(true);
  };
  // The reset button hides itself, so focus moves to the slider instead of being lost.
  resetButton.addEventListener('click', () => {
    reset();
    slider.focus();
  });
  // Keyboard users can also return to today's value from the slider.
  slider.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') reset();
  });
  // Switching the source keeps the chosen price where the new source can fund it.
  sourceSelect.addEventListener('change', () => {
    source = (sourceSelect.value || null) as ValueSource;
    if (source) sourceDot.style.setProperty('--chip-color', `var(--tile-${source})`);
    else sourceDot.style.removeProperty('--chip-color');
    const { base } = current();
    if (activePreset && parityCap(base, activePreset, source) === null) activePreset = null;
    // A price beyond the new source's reach settles at its limit, so switching back does not jump.
    if (!activePreset && selectedCap !== null) selectedCap = Math.min(selectedCap, maxCap(base, source));
    render(true);
  });
  new ResizeObserver(() => render()).observe(treemap);
  slider.disabled = false;
  sourceSelect.disabled = false;
  createOptionPicker(root, sourceSelect, {
    wrapper: root.querySelector<HTMLElement>('[data-source-picker]')!,
    selectors: { trigger: '[data-source-trigger]', value: '[data-source-value]', list: '[data-source-list]', option: '[data-source-option]', optionKey: 'sourceOption' },
    displayOptionLabel: true,
    openAttribute: 'data-source-open',
    toggleEvent: 'sourcetoggle',
  });

  subscribeBitcoinPricePoll({
    onPrice: (point) => { bitcoinPrice = point.price; },
    onState: (state) => {
      bitcoinState = state === 'updated' ? 'live' : state === 'connecting' ? 'connecting' : 'unavailable';
      render();
    },
  });
  void fetchGoldPrice().then((price) => {
    goldLive = price !== undefined;
    if (price) goldPrice = price;
    render();
  });
  render();
}
