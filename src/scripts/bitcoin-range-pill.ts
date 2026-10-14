import type { BitcoinRange } from '../lib/bitcoin-range';

type RangeUnit = BitcoinRange['unit'];

// A single pill shares the app's tap timing and finger-driven drag behavior.
// Range data stays with the tracker; hovering never requests or redraws a chart.
export function createRangePill(
  bar: HTMLElement,
  onDrop: (unit: RangeUnit) => void,
  onStep: (unit: Exclude<RangeUnit, 'all'>, step: number) => void,
) {
  const pill = bar.querySelector<HTMLElement>('[data-range-pill]')!;
  const slots = [...bar.querySelectorAll<HTMLElement>('[data-range-slot]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  let selectedIndex = slots.findIndex((slot) => slot.dataset.selected === 'true');
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressClick = false;
  let nudgeAnimations: Animation[] = [];
  let drag: {
    pointerId: number; startX: number; startY: number; lastX: number; lastY: number;
    left: number; top: number; width: number; height: number;
    hover: number; axis?: 'horizontal' | 'vertical'; bounds: DOMRect[]; labels: DOMRect[];
    accumulatedY: number; outside: boolean;
  } | undefined;

  function stopNudge() {
    nudgeAnimations.forEach((animation) => animation.cancel());
    nudgeAnimations = [];
  }

  function nudge(direction: number) {
    stopNudge();
    if (reducedMotion.matches) return;
    const button = slots[selectedIndex].querySelector<HTMLElement>('[data-range-select]')!;
    const label = slots[selectedIndex].querySelector<HTMLElement>('[data-range-label]')!;
    // Separate translate from the pill's horizontal positioning transform.
    nudgeAnimations = [pill, button].map((element) => element.animate([
      { translate: '0 0' }, { translate: `0 ${direction * 6}px` }, { translate: '0 0' },
    ], { duration: 220, easing: 'ease-in-out' }));
    nudgeAnimations.push(label.animate([
      { transform: `translateY(${direction * 60}%)`, opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ], { duration: 200, easing: 'cubic-bezier(.215, .61, .355, 1)' }));
  }

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
    const { pointerId, axis, hover } = drag;
    drag = undefined;
    delete bar.dataset.dragging;
    if (bar.hasPointerCapture(pointerId)) bar.releasePointerCapture(pointerId);
    if (!axis) return;
    // Pointer capture can generate a click after release. Keep keyboard clicks.
    suppressClick = true;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { suppressClick = false; }, 0);
    if (commit && axis === 'horizontal' && hover !== selectedIndex) {
      selectedIndex = hover;
      highlight(selectedIndex);
      onDrop(slots[selectedIndex].dataset.rangeSlot as RangeUnit);
      slots[selectedIndex].querySelector<HTMLButtonElement>('[data-range-select]')!.focus({ preventScroll: true });
    }
    highlight(selectedIndex);
    placeSelected(true);
  }

  function select(unit: RangeUnit) {
    const next = slots.findIndex((slot) => slot.dataset.rangeSlot === unit);
    if (next < 0) return;
    // A vertical step updates chart data immediately without ending the swipe.
    if (drag?.axis === 'vertical' && next === selectedIndex) return;
    finishDrag(false);
    stopNudge();
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
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY,
      left: bounds.left - track.left, top: bounds.top - track.top, width: bounds.width, height: bounds.height,
      hover: selectedIndex, accumulatedY: 0, outside: false,
      bounds: slots.map((slot) => slot.getBoundingClientRect()),
      labels: slots.map((slot) => slot.querySelector<HTMLElement>('[data-range-label]')!.getBoundingClientRect()),
    };
  }, { signal: events.signal });

  bar.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.axis) {
      const dx = Math.abs(event.clientX - drag.startX);
      const dy = Math.abs(event.clientY - drag.startY);
      if (Math.max(dx, dy) < 6 || dx === dy) return;
      if (dy > dx && slots[selectedIndex].dataset.rangeSlot === 'all') { drag = undefined; return; }
      // Sample again in case the tap animation moved since pointer-down.
      const bounds = pill.getBoundingClientRect();
      const track = bar.getBoundingClientRect();
      drag.left = bounds.left - track.left;
      drag.top = bounds.top - track.top;
      drag.axis = dy > dx ? 'vertical' : 'horizontal';
      stopNudge();
      clearTimeout(highlightTimer);
      if (drag.axis === 'vertical') highlight(selectedIndex);
      bar.dataset.dragging = 'true';
      bar.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    if (drag.axis === 'vertical') {
      if (drag.outside) return;
      const bounds = drag.bounds[selectedIndex];
      // Like the app, stop firing after leaving the chip's 16 px allowance.
      if (event.clientX < bounds.left - 16 || event.clientX > bounds.right + 16
        || event.clientY < bounds.top - 16 || event.clientY > bounds.bottom + 16) {
        drag.outside = true;
        return;
      }
      drag.accumulatedY += event.clientY - drag.lastY;
      drag.lastY = event.clientY;
      const step = drag.accumulatedY < 0 ? 1 : -1;
      const steps = Math.floor(Math.abs(drag.accumulatedY) / 24);
      if (steps) {
        drag.accumulatedY += step * steps * 24;
        onStep(slots[selectedIndex].dataset.rangeSlot as Exclude<RangeUnit, 'all'>, step * steps);
        nudge(-step);
      }
      return;
    }
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
    if (drag && !drag.axis) drag = undefined;
  }, { signal: events.signal });
  bar.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drag?.axis) {
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
    stopNudge();
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
      stopNudge();
      observer.disconnect();
      events.abort();
      clearTimeout(highlightTimer);
      clearTimeout(clickTimer);
    },
  };
}
