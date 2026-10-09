import type { BitcoinRange } from '../lib/bitcoin-range';

type RangeUnit = BitcoinRange['unit'];

// A single pill shares the app's tap timing and finger-driven drag behavior.
// Range data stays with the tracker; hovering never requests or redraws a chart.
export function createRangePill(bar: HTMLElement, onDrop: (unit: RangeUnit) => void) {
  const pill = bar.querySelector<HTMLElement>('[data-range-pill]')!;
  const slots = [...bar.querySelectorAll<HTMLElement>('[data-range-slot]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  let selectedIndex = slots.findIndex((slot) => slot.dataset.selected === 'true');
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressClick = false;
  let drag: {
    pointerId: number; startX: number; startY: number; lastX: number;
    left: number; top: number; width: number; height: number;
    hover: number; active: boolean; bounds: DOMRect[]; labels: DOMRect[];
  } | undefined;

  function highlight(index: number) {
    clearTimeout(highlightTimer);
    slots.forEach((slot, i) => { slot.dataset.highlighted = String(i === index); });
  }

  function position(left: number, top: number, width: number, height: number) {
    pill.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    pill.style.width = `${width}px`;
    pill.style.height = `${height}px`;
  }

  function placeSelected(animate: boolean) {
    const bounds = slots[selectedIndex]?.getBoundingClientRect();
    if (!bounds?.width) return;
    const track = bar.getBoundingClientRect();
    // Layout changes and first paint should never glide from stale geometry.
    if (!animate) pill.style.transition = 'none';
    position(bounds.left - track.left, bounds.top - track.top, bounds.width, bounds.height);
    pill.hidden = false;
    if (!animate) {
      pill.getBoundingClientRect(); // Commit the position before restoring transitions.
      pill.style.transition = '';
    }
  }

  function finishDrag(commit: boolean) {
    if (!drag) return;
    const { pointerId, active, hover } = drag;
    drag = undefined;
    delete bar.dataset.dragging;
    if (bar.hasPointerCapture(pointerId)) bar.releasePointerCapture(pointerId);
    if (!active) return;
    // Pointer capture can generate a click after release. Keep keyboard clicks.
    suppressClick = true;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { suppressClick = false; }, 0);
    if (commit && hover !== selectedIndex) {
      selectedIndex = hover;
      highlight(selectedIndex);
      onDrop(slots[selectedIndex].dataset.rangeSlot as RangeUnit);
      slots[selectedIndex].querySelector<HTMLButtonElement>('[data-range-select]')!.focus({ preventScroll: true });
    }
    highlight(selectedIndex);
    placeSelected(true);
  }

  function select(unit: RangeUnit) {
    finishDrag(false);
    const next = slots.findIndex((slot) => slot.dataset.rangeSlot === unit);
    if (next < 0) return;
    const changed = next !== selectedIndex;
    selectedIndex = next;
    placeSelected(!pill.hidden);
    clearTimeout(highlightTimer);
    if (changed && !reducedMotion.matches) {
      highlightTimer = setTimeout(() => highlight(selectedIndex), 90);
    } else {
      highlight(selectedIndex);
    }
  }

  bar.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || drag || pill.hidden) return;
    if ((event.target as Element).closest('[data-range-step]')) return;
    // Use the visible pill, so a second gesture can grab an interrupted glide.
    const bounds = pill.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    const track = bar.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX,
      left: bounds.left - track.left, top: bounds.top - track.top, width: bounds.width, height: bounds.height,
      hover: selectedIndex, active: false,
      bounds: slots.map((slot) => slot.getBoundingClientRect()),
      labels: slots.map((slot) => slot.querySelector<HTMLElement>('[data-range-label]')!.getBoundingClientRect()),
    };
  }, { signal: events.signal });

  bar.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      const dx = Math.abs(event.clientX - drag.startX);
      const dy = Math.abs(event.clientY - drag.startY);
      if (dy > dx && dy > 6) { drag = undefined; return; }
      if (dx < 6 || dx <= dy) return;
      // Sample again in case the tap animation moved since pointer-down.
      const bounds = pill.getBoundingClientRect();
      const track = bar.getBoundingClientRect();
      drag.left = bounds.left - track.left;
      drag.top = bounds.top - track.top;
      drag.active = true;
      clearTimeout(highlightTimer);
      bar.dataset.dragging = 'true';
      bar.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const track = bar.getBoundingClientRect();
    const min = drag.bounds[0].left - track.left;
    const max = drag.bounds.at(-1)!.right - track.left - drag.width;
    drag.left = Math.max(min, Math.min(max, drag.left + event.clientX - drag.lastX));
    drag.lastX = event.clientX;
    const center = track.left + drag.left + drag.width / 2;
    const overLabel = drag.labels.findIndex((label) => center >= label.left && center <= label.right);
    // Between labels retain the last highlight, exactly like the app.
    if (overLabel >= 0) drag.hover = overLabel;
    highlight(drag.hover);
    position(drag.left, drag.top, drag.width, drag.height);
  }, { signal: events.signal });

  bar.addEventListener('pointerup', (event) => {
    if (drag?.pointerId === event.pointerId) finishDrag(true);
  }, { signal: events.signal });
  bar.addEventListener('pointercancel', (event) => {
    if (drag?.pointerId === event.pointerId) finishDrag(false);
  }, { signal: events.signal });
  bar.addEventListener('lostpointercapture', (event) => {
    if (drag?.pointerId === event.pointerId) finishDrag(false);
  }, { signal: events.signal });
  bar.addEventListener('pointerleave', () => {
    if (drag && !drag.active) drag = undefined;
  }, { signal: events.signal });
  bar.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drag?.active) {
      event.preventDefault();
      finishDrag(false);
    }
  }, { signal: events.signal });
  bar.addEventListener('click', (event) => {
    if (suppressClick && event.detail !== 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }
  }, { capture: true, signal: events.signal });

  function syncLayout() {
    finishDrag(false);
    highlight(selectedIndex);
    placeSelected(false);
  }
  const observer = new ResizeObserver(syncLayout);
  observer.observe(bar);
  slots.forEach((slot) => observer.observe(slot));
  reducedMotion.addEventListener('change', syncLayout, { signal: events.signal });
  window.addEventListener('blur', () => finishDrag(false), { signal: events.signal });
  highlight(selectedIndex);

  return {
    select,
    destroy() {
      finishDrag(false);
      observer.disconnect();
      events.abort();
      clearTimeout(highlightTimer);
      clearTimeout(clickTimer);
    },
  };
}
