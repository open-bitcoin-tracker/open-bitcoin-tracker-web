import { createGuideDrawer } from '../lib/guide-drawer';
import { subscribeBitcoinPricePoll } from '../lib/bitcoin-price-poll';
import { formatDate, interpolate } from '../features/supply/model';
import { ASSET_IDS, baseValues, tileClipPath, capFromPosition, circulatingSupply, estimateHeight, formatChange, formatCompactUsd, formatUsd, positionFromCap, priceMilestones, redistribute, SLIDER_STEPS, snapCap, layoutAssets, totalValue, type AssetValues, type Notch, type Rect, type WealthSnapshot } from '../features/wealth/model';
import type { WealthCopy } from '../i18n/wealth';

type Copy = WealthCopy & { locale: string };

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
  const CALLOUT_IDS = ['bitcoin', 'silver'] as const;
  const callouts = new Map(CALLOUT_IDS.map((id) => {
    const callout = root.querySelector<HTMLElement>(`[data-callout="${id}"]`)!;
    return [id, { callout, value: callout.querySelector<HTMLElement>('[data-callout-value]')! }];
  }));
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const date = (value: string) => formatDate(value, copy.locale);

  let bitcoinPrice = snapshot.bitcoin.fallbackPrice;
  let goldPrice = snapshot.gold.fallbackPrice;
  let bitcoinState: 'connecting' | 'live' | 'unavailable' = 'connecting';
  let goldLive: boolean | undefined;
  // `null` follows today's live market cap; a number is the visitor's hypothetical market cap.
  let selectedCap: number | null = null;

  const current = () => {
    const supply = circulatingSupply(estimateHeight(snapshot.bitcoin, Date.now()));
    const base = baseValues(snapshot, fiat, bitcoinPrice, goldPrice, snapshot.silver.fallbackPrice, supply);
    return { supply, base, total: totalValue(base) };
  };

  /**
   * A tile under Bitcoin's square (or gold around silver's) keeps its full rectangle and cuts the
   * square out of its corner, leaving an L shape. Its label moves into the larger remaining arm.
   */
  function wrapAround(body: HTMLElement, rect: Rect, notch: Notch | undefined, corner: Notch | undefined) {
    body.style.clipPath = tileClipPath(rect, notch, corner, (value) => `${value}px`);
    if (!notch) {
      body.style.removeProperty('padding-left');
      body.style.removeProperty('padding-top');
      return;
    }
    const { w, h } = notch;
    const rightArm = w < rect.w - 1 && (h >= rect.h - 1 || (rect.w - w) * rect.h >= rect.w * (rect.h - h));
    body.style.paddingLeft = rightArm ? `calc(${w}px + .25rem)` : '';
    body.style.paddingTop = rightArm ? '' : `calc(${h}px + .25rem)`;
  }

  function layout(values: AssetValues) {
    const { width, height } = treemap.getBoundingClientRect();
    if (!width || !height) return;
    const { rects, notches, corners } = layoutAssets(values, width, height);
    for (const id of ASSET_IDS) {
      const rect = rects[id];
      const { tile, body } = tiles.get(id)!;
      wrapAround(body, rect, notches[id], corners[id]);
      tile.style.left = `${rect.x / width * 100}%`;
      tile.style.top = `${rect.y / height * 100}%`;
      // A 1px overlap keeps the page background from showing through at fractional seams.
      tile.style.width = `calc(${rect.w / width * 100}% + ${rect.w > 0 ? 1 : 0}px)`;
      tile.style.height = `calc(${rect.h / height * 100}% + ${rect.h > 0 ? 1 : 0}px)`;
      tile.toggleAttribute('data-empty', rect.w <= 0 || rect.h <= 0);
    }
    // Mirror the tile label's container query: tile minus its inner padding.
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const inset = rem * .5;
    for (const id of CALLOUT_IDS) {
      const rect = rects[id];
      const { callout } = callouts.get(id)!;
      const outside = rect.w > 0 && rect.h > 0 && (rect.w - inset <= 4 * rem || rect.h - inset <= 1.9 * rem);
      callout.toggleAttribute('data-visible', outside);
      // While the label sits outside, the box shows only Bitcoin's ₿ (silver's stays plain) so the value appears once.
      tiles.get(id)!.tile.toggleAttribute('data-label-outside', outside);
      // Like Bitcoin's, silver's label sits beside its square, inside gold, when gold also has room
      // for its own centred label. Otherwise it sits just above the square, over the tile there, as
      // long as that is still inside the chart. In gold's bottom-right corner, or when the right side
      // would run past the chart's edge (a narrow gold strip on tall phone charts), it goes on the left.
      const gold = rects.gold;
      const roomBeside = gold.w - rect.w - 4 >= callout.offsetWidth && gold.h >= 2 * callout.offsetHeight + 2.75 * rem;
      const roomAbove = rect.y >= callout.offsetHeight + 2;
      const above = id === 'silver' && !corners.gold && !roomBeside && roomAbove;
      const overflowsRight = rect.x + rect.w + 4 + callout.offsetWidth > width && rect.x >= callout.offsetWidth + 4;
      const onLeft = (id === 'silver' && !!corners.gold) || (!above && overflowsRight);
      callout.style.left = onLeft ? '' : above ? `${rect.x}px` : `${rect.x + rect.w + 4}px`;
      callout.style.right = onLeft ? `${width - rect.x + 4}px` : '';
      callout.style.top = above ? '' : `${rect.y}px`;
      callout.style.bottom = above ? `${height - rect.y + 2}px` : '';
      callout.style.alignItems = onLeft ? 'flex-end' : '';
    }
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let shown: AssetValues | undefined;
  let frame = 0;

  /**
   * Resetting glides between layouts by interpolating values and laying out every frame,
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

  // The scale marks every round price; powers of ten get a label. It follows the live range.
  const scale = root.querySelector<HTMLElement>('[data-scale]')!;
  let scaleKey = '';
  function drawScale(min: number, max: number, supply: number) {
    const marks = priceMilestones(min / supply, max / supply).map((price) => ({ price, at: positionFromCap(price * supply, min, max) / SLIDER_STEPS }));
    const key = marks.map(({ at }) => at.toFixed(4)).join();
    if (key === scaleKey) return;
    scaleKey = key;
    scale.replaceChildren(...marks.map(({ price, at }) => {
      const major = /^10*$/.test(String(price));
      const mark = document.createElement('span');
      mark.className = major ? 'scale-mark scale-mark--major' : 'scale-mark';
      mark.style.setProperty('--at', String(at));
      if (major) mark.dataset.label = formatCompactUsd(price);
      return mark;
    }));
  }

  function render(animate = false) {
    const { supply, base, total } = current();
    // Bitcoin can only grow from today's live market cap, up to all global wealth.
    const cap = Math.min(total, Math.max(base.bitcoin, selectedCap ?? base.bitcoin));
    const simulated = selectedCap !== null;
    const values: AssetValues = simulated ? redistribute(base, cap) : base;
    const price = cap / supply;

    draw(values, animate);
    for (const id of ASSET_IDS) {
      const { value, change } = tiles.get(id)!;
      value.textContent = formatCompactUsd(values[id]);
      const ratio = base[id] > 0 ? values[id] / base[id] - 1 : 0;
      change.textContent = simulated && Math.abs(ratio) > 1e-9 ? formatChange(ratio) : '';
    }
    for (const [id, { value }] of callouts) value.textContent = formatCompactUsd(values[id]);
    priceOutput.textContent = formatUsd(price);
    const position = Math.round(positionFromCap(cap, base.bitcoin, total));
    slider.value = String(position);
    slider.style.setProperty('--fill', `${position / SLIDER_STEPS * 100}%`);
    drawScale(base.bitcoin, total, supply);
    slider.setAttribute('aria-valuetext', interpolate(copy.sliderValue, { cap: formatCompactUsd(cap, 4), price: formatUsd(price) }));

    const lines = [
      bitcoinState === 'unavailable' ? interpolate(copy.priceUnavailable, { date: date(snapshot.bitcoin.fallbackPriceDate) }) : '',
      goldLive === false ? interpolate(copy.goldUnavailable, { date: date(snapshot.gold.fallbackPriceDate) }) : '',
    ];
    status.textContent = lines.filter(Boolean).join(' ');
  }

  slider.addEventListener('input', () => {
    const { base, total } = current();
    const position = Number(slider.value);
    selectedCap = position <= 0 ? null : capFromPosition(position, base.bitcoin, total);
    render();
  });
  slider.addEventListener('change', () => render());

  /**
   * The slider moves only by dragging its thumb: taps or clicks elsewhere on the track do nothing.
   * The input ignores the pointer; its wrapper takes it with `touch-action: pan-y`, so a vertical
   * swipe that starts beside the thumb still scrolls the page. A touch that starts on the thumb
   * cancels the browser's own gesture, so dragging it down never scrolls or pulls to refresh.
   * A drag keeps its grab offset, so the thumb never jumps. Keyboard control stays native, plus
   * Page Up/Down between round prices.
   */
  const sliderHit = root.querySelector<HTMLElement>('[data-slider-hit]')!;
  let dragId: number | null = null;
  let grabOffset = 0;
  const thumbWidth = () => parseFloat(getComputedStyle(slider).getPropertyValue('--thumb')) || 22;
  const thumbOffset = (event: { clientX: number }) => {
    const { left, width } = slider.getBoundingClientRect();
    const thumb = thumbWidth();
    return event.clientX - (left + thumb / 2 + Number(slider.value) / SLIDER_STEPS * (width - thumb));
  };
  // Fingers get a larger hit area around the thumb than the mouse.
  const onThumb = (event: { clientX: number }, touch: boolean) => Math.abs(thumbOffset(event)) <= thumbWidth() / 2 + (touch ? 14 : 4);
  // A drag pulls onto a round price (see the scale under the track) once within a few pixels of it.
  const SNAP_PX = 7;
  let snappedTo: number | undefined;
  function followPointer(event: PointerEvent) {
    const { left, width } = slider.getBoundingClientRect();
    const thumb = thumbWidth();
    const ratio = Math.min(1, Math.max(0, (event.clientX - grabOffset - left - thumb / 2) / (width - thumb)));
    const { supply, base, total } = current();
    const position = ratio * SLIDER_STEPS;
    const { cap, milestone } = snapCap(position, base.bitcoin, total, supply, SNAP_PX / Math.max(1, width - thumb) * SLIDER_STEPS);
    if (milestone !== undefined && milestone !== snappedTo) navigator.vibrate?.(8);
    snappedTo = milestone;
    const next = cap <= base.bitcoin ? null : cap;
    if (next === selectedCap) return;
    selectedCap = next;
    render();
  }
  sliderHit.addEventListener('pointerdown', (event) => {
    if (slider.disabled || dragId !== null || !onThumb(event, event.pointerType === 'touch')) return;
    if (event.pointerType === 'mouse') event.preventDefault();
    dragId = event.pointerId;
    grabOffset = thumbOffset(event);
    sliderHit.toggleAttribute('data-dragging', true);
    slider.focus({ preventScroll: true });
    // Keep receiving moves when the pointer leaves the track; capture can fail if the press already ended.
    try { sliderHit.setPointerCapture(event.pointerId); } catch { /* moves on the track still work */ }
  });
  // Pointer events still fire after this, so the drag itself is unaffected.
  sliderHit.addEventListener('touchstart', (event) => {
    if (!slider.disabled && event.touches.length === 1 && onThumb(event.touches[0], true)) event.preventDefault();
  }, { passive: false });
  sliderHit.addEventListener('pointermove', (event) => {
    if (event.pointerId === dragId) followPointer(event);
    else if (event.pointerType === 'mouse') sliderHit.toggleAttribute('data-over-thumb', !slider.disabled && onThumb(event, false));
  });
  sliderHit.addEventListener('pointerleave', () => sliderHit.removeAttribute('data-over-thumb'));
  const endDrag = (event: PointerEvent) => {
    if (event.pointerId !== dragId) return;
    dragId = null;
    sliderHit.removeAttribute('data-dragging');
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  };
  sliderHit.addEventListener('pointerup', endDrag);
  sliderHit.addEventListener('pointercancel', endDrag);
  // Keyboard users can return to today's value from the slider.
  // Page Up and Page Down jump between round prices.
  slider.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      selectedCap = null;
      render(true);
      return;
    }
    if (event.key !== 'PageUp' && event.key !== 'PageDown') return;
    event.preventDefault();
    const { supply, base, total } = current();
    const price = Math.max(base.bitcoin, selectedCap ?? base.bitcoin) / supply;
    const milestones = priceMilestones(base.bitcoin / supply, total / supply);
    const target = event.key === 'PageUp' ? milestones.find((m) => m > price * (1 + 1e-9)) : milestones.findLast((m) => m < price * (1 - 1e-9));
    selectedCap = target !== undefined ? target * supply : event.key === 'PageUp' ? total : null;
    render(true);
  });
  // The sources move into a drawer opened from the help button beside the title, so the chart keeps the page's height.
  // The disclosure at the bottom stays when JavaScript or dialog support is absent.
  const methodTrigger = root.querySelector<HTMLButtonElement>('[data-method-trigger]');
  const methodDialog = root.querySelector<HTMLDialogElement>('[data-method-dialog]');
  const methodBody = root.querySelector<HTMLElement>('[data-method-body]');
  const methodContent = root.querySelector<HTMLElement>('[data-method-content]');
  const methodFallback = root.querySelector<HTMLDetailsElement>('[data-method-fallback]');
  const methodOverview = root.querySelector<HTMLElement>('[data-method-overview]');
  if (methodTrigger && methodDialog && methodBody && methodContent && methodFallback && methodOverview && typeof methodDialog.showModal === 'function') {
    methodBody.append(methodContent);
    methodFallback.hidden = true;
    methodTrigger.hidden = false;
    const drawer = createGuideDrawer({
      dialog: methodDialog,
      overview: methodOverview,
      heading: root.querySelector<HTMLElement>('[data-method-title]'),
      overviewBody: methodBody,
      closeButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-method-close]')),
      trigger: methodTrigger,
    });
    // Like A Bit of Earth's help button, the tooltip stays hidden after a click until the pointer or focus leaves.
    methodTrigger.addEventListener('click', () => {
      methodTrigger.toggleAttribute('data-tooltip-dismissed', true);
      drawer.open();
    });
    for (const type of ['mouseleave', 'blur']) methodTrigger.addEventListener(type, () => {
      if (!methodDialog.open) methodTrigger.removeAttribute('data-tooltip-dismissed');
    });
  }
  new ResizeObserver(() => render()).observe(treemap);
  slider.disabled = false;

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
