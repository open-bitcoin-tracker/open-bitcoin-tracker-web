const STORAGE_KEY = 'obt-video-price-layout';
const PADDING = 16;
const FRAME_DELAY = 1500;
const DEFAULTS = { version: 1, x: 50, y: 50, size: 100 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Resize = { corner: Corner; width: number; height: number; anchorX: number; anchorY: number; effectiveSize: number };
type Operation = { pointerId: number; capture: HTMLElement; clientX: number; clientY: number; moved: boolean } & (
  { kind: 'move'; grabX: number; grabY: number }
  | ({ kind: 'resize' } & Resize)
);

/** Move and resize the live price without changing playback or currency settings. */
export function createVideoPriceLayout(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('[data-price-stage]')!;
  const position = root.querySelector<HTMLElement>('[data-price-position]')!;
  const resetButton = root.querySelector<HTMLButtonElement>('[data-reset-price]')!;
  const handles = [...position.querySelectorAll<HTMLButtonElement>('[data-price-resize]')];
  const original = {
    scale: root.style.getPropertyValue('--video-price-scale'), fit: root.style.getPropertyValue('--video-price-fit'),
    left: position.style.left, top: position.style.top, tabIndex: position.tabIndex,
    handleTabIndexes: handles.map(handle => handle.tabIndex),
    resetDisabled: resetButton.disabled,
  };
  const removeListeners: (() => void)[] = [];
  let state = { ...DEFAULTS };
  let fit = 1;
  let appliedScale: number | undefined;
  let destroyed = false;
  let frame = false;
  let dismissed = false;
  let frameTimer: number | undefined;
  let lastInput: 'keyboard' | 'pointer' | undefined;
  let operation: Operation | undefined;

  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved?.version === 1 && ['x', 'y', 'size'].every(axis => typeof saved[axis] === 'number' && Number.isFinite(saved[axis]))) {
      state = { version: 1, x: clamp(saved.x, 0, 100), y: clamp(saved.y, 0, 100), size: clamp(saved.size, 25, 200) };
    }
  } catch { /* Positioning remains available with blocked or invalid storage. */ }

  function listen(target: EventTarget, type: string, listener: EventListener) {
    target.addEventListener(type, listener);
    removeListeners.push(() => target.removeEventListener(type, listener));
  }
  function notify() { root.dispatchEvent(new Event('pricelayoutchange')); }
  function save() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { /* A blocked preference store must not prevent positioning. */ }
  }
  function updateDefault() {
    const isDefault = Math.abs(state.x - 50) <= .01 && Math.abs(state.y - 50) <= .01 && Math.abs(state.size - 100) <= .01;
    root.toggleAttribute('data-price-default', isDefault);
    resetButton.disabled = isDefault;
  }
  function geometry() {
    const viewport = stage.getBoundingClientRect();
    const box = position.getBoundingClientRect();
    const travelX = Math.max(0, viewport.width - box.width - PADDING * 2);
    const travelY = Math.max(0, viewport.height - box.height - PADDING * 2);
    return {
      viewport, box, travelX, travelY,
      startX: travelX > 0 ? PADDING : (viewport.width - box.width) / 2,
      startY: travelY > 0 ? PADDING : (viewport.height - box.height) / 2,
    };
  }
  function writePosition(left: number, top: number) {
    const x = `${left}px`, y = `${top}px`;
    if (position.style.left !== x) position.style.left = x;
    if (position.style.top !== y) position.style.top = y;
  }
  function refresh() {
    if (destroyed) return;
    const scale = state.size / 100;
    if (appliedScale !== scale) { root.style.setProperty('--video-price-scale', String(scale)); appliedScale = scale; }
    // Recover toward the requested scale when the viewport grows or text shrinks,
    // without repeatedly resetting the fit and triggering resize observations.
    for (let pass = 0; pass < 2; pass++) {
      const { viewport, box } = geometry();
      const ratio = Math.min(box.width > 0 ? Math.max(0, viewport.width - PADDING * 2) / box.width : 1,
        box.height > 0 ? Math.max(0, viewport.height - PADDING * 2) / box.height : 1);
      const next = clamp(fit * ratio, .01, 1);
      if (Math.abs(next - fit) <= .001) break;
      fit = next;
      root.style.setProperty('--video-price-fit', String(fit));
    }
    const { startX, startY, travelX, travelY } = geometry();
    writePosition(startX + travelX * state.x / 100, startY + travelY * state.y / 100);
    updateDefault();
  }
  function place(left: number, top: number) {
    const { startX, startY, travelX, travelY } = geometry();
    state.x = travelX > 0 ? clamp((left - startX) / travelX * 100, 0, 100) : 50;
    state.y = travelY > 0 ? clamp((top - startY) / travelY * 100, 0, 100) : 50;
    writePosition(startX + travelX * state.x / 100, startY + travelY * state.y / 100);
    updateDefault();
  }
  function clearFrameTimer() {
    if (frameTimer !== undefined) window.clearTimeout(frameTimer);
    frameTimer = undefined;
  }
  function keyboardFocus() {
    const active = document.activeElement;
    return lastInput !== 'pointer' && !!active && position.contains(active) && active.matches(':focus-visible');
  }
  function setFrame(visible: boolean) {
    if (frame === visible) return;
    frame = visible;
    root.toggleAttribute('data-price-layout-open', visible);
    for (const handle of handles) handle.tabIndex = visible ? 0 : -1;
  }
  function scheduleHide(ignoreFocus = false) {
    clearFrameTimer();
    if (destroyed || operation || (!ignoreFocus && keyboardFocus())) return;
    frameTimer = window.setTimeout(() => {
      frameTimer = undefined;
      if (!destroyed && !operation && !keyboardFocus()) setFrame(false);
    }, FRAME_DELAY);
  }
  function revealFrame() {
    if (destroyed || dismissed || document.hidden) return;
    setFrame(true);
    scheduleHide();
  }
  function resizeGeometry(corner: Corner): Resize {
    const { viewport, box } = geometry();
    return {
      corner, width: box.width, height: box.height, effectiveSize: state.size * fit,
      anchorX: box.left - viewport.left + (corner.endsWith('w') ? box.width : 0),
      anchorY: box.top - viewport.top + (corner.startsWith('n') ? box.height : 0),
    };
  }
  function resize(resizing: Resize, ratio: number) {
    const { viewport } = geometry();
    const west = resizing.corner.endsWith('w'), north = resizing.corner.startsWith('n');
    const maxWidth = west ? resizing.anchorX - PADDING : viewport.width - PADDING - resizing.anchorX;
    const maxHeight = north ? resizing.anchorY - PADDING : viewport.height - PADDING - resizing.anchorY;
    const maxRatio = Math.max(0, Math.min(resizing.width > 0 ? maxWidth / resizing.width : 1, resizing.height > 0 ? maxHeight / resizing.height : 1));
    state.size = clamp(resizing.effectiveSize * Math.min(maxRatio, Math.max(0, ratio)), 25, 200);
    refresh();
    const box = position.getBoundingClientRect();
    place(resizing.anchorX - (west ? box.width : 0), resizing.anchorY - (north ? box.height : 0));
  }
  function finish(persist = true) {
    if (!operation) return;
    const { pointerId, capture } = operation;
    operation = undefined;
    try { if (capture.hasPointerCapture(pointerId)) capture.releasePointerCapture(pointerId); } catch { /* Capture may already be released. */ }
    root.removeAttribute('data-price-dragging');
    root.removeAttribute('data-price-resizing');
    notify();
    if (persist) save();
    scheduleHide();
  }
  function move(event: PointerEvent) {
    if (destroyed || !operation || operation.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - operation.clientX, dy = event.clientY - operation.clientY;
    const changed = Math.abs(dx) + Math.abs(dy) >= .001;
    if (!operation.moved && !changed) return;
    operation.moved ||= changed;
    if (operation.kind === 'move') {
      const { viewport } = geometry();
      place(event.clientX - viewport.left - operation.grabX, event.clientY - viewport.top - operation.grabY);
    } else {
      const width = operation.width * (operation.corner.endsWith('w') ? -1 : 1);
      const height = operation.height * (operation.corner.startsWith('n') ? -1 : 1);
      const diagonal = width * width + height * height;
      resize(operation, diagonal > 0 ? 1 + (dx * width + dy * height) / diagonal : 1);
    }
  }
  function stopForInactivePage() {
    finish();
    clearFrameTimer();
    setFrame(false);
  }
  function reset() {
    const restoreFocus = document.activeElement === resetButton;
    finish(false);
    state = { ...DEFAULTS };
    refresh();
    save();
    dismissed = false;
    revealFrame();
    if (restoreFocus) position.focus({ preventScroll: true });
  }

  listen(resetButton, 'click', reset);
  listen(position, 'pointerdown', ((event: PointerEvent) => {
    if (operation || !event.isPrimary || event.button !== 0) return;
    lastInput = 'pointer';
    dismissed = false;
    event.preventDefault();
    const handle = (event.target as Element | null)?.closest<HTMLElement>('[data-price-resize]');
    const corner = handle?.dataset.priceResize as Corner | undefined;
    const box = position.getBoundingClientRect();
    operation = corner && ['nw', 'ne', 'sw', 'se'].includes(corner) && position.contains(handle!)
      ? { kind: 'resize', pointerId: event.pointerId, capture: position, clientX: event.clientX, clientY: event.clientY, moved: false, ...resizeGeometry(corner) }
      : { kind: 'move', pointerId: event.pointerId, capture: position, clientX: event.clientX, clientY: event.clientY, moved: false, grabX: event.clientX - box.left, grabY: event.clientY - box.top };
    (handle ?? position).focus({ preventScroll: true });
    clearFrameTimer();
    setFrame(true);
    try { position.setPointerCapture(event.pointerId); } catch { /* Window listeners also support uncaptured dragging. */ }
    root.setAttribute('data-price-dragging', '');
    if (operation.kind === 'resize') root.setAttribute('data-price-resizing', operation.corner);
    notify();
  }) as EventListener);
  listen(position, 'click', () => { dismissed = false; revealFrame(); });
  listen(position, 'pointermove', () => { if (frame) scheduleHide(); });
  listen(window, 'pointermove', move as EventListener);
  listen(window, 'pointerup', ((event: PointerEvent) => {
    if (operation?.pointerId !== event.pointerId) return;
    move(event);
    finish();
  }) as EventListener);
  const cancel = (event: PointerEvent) => { if (operation?.pointerId === event.pointerId) finish(); };
  listen(window, 'pointercancel', cancel as EventListener);
  listen(position, 'lostpointercapture', cancel as EventListener);
  listen(window, 'blur', stopForInactivePage);
  listen(document, 'visibilitychange', () => { if (document.hidden) stopForInactivePage(); else if (keyboardFocus()) revealFrame(); });
  listen(window, 'focus', () => { if (keyboardFocus()) revealFrame(); });
  listen(window, 'keydown', ((event: KeyboardEvent) => {
    lastInput = 'keyboard';
    if (event.key === 'Escape') {
      if (!frame && !operation) return;
      event.preventDefault();
      finish();
      dismissed = true;
      clearFrameTimer();
      setFrame(false);
      if (handles.some(handle => handle === document.activeElement)) position.focus({ preventScroll: true });
      return;
    }
    dismissed = false;
    if (keyboardFocus()) revealFrame();
  }) as EventListener);
  listen(position, 'focusin', () => { if (keyboardFocus()) revealFrame(); });
  listen(position, 'focusout', ((event: FocusEvent) => { if (!position.contains(event.relatedTarget as Node | null)) scheduleHide(true); }) as EventListener);
  listen(position, 'keydown', ((event: KeyboardEvent) => {
    if (event.key === 'Escape') return;
    lastInput = 'keyboard';
    dismissed = false;
    revealFrame();
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const handle = (event.target as Element | null)?.closest<HTMLElement>('[data-price-resize]');
    const corner = handle?.dataset.priceResize as Corner | undefined;
    if (corner) {
      const grow = ['+', '=', 'ArrowUp', 'ArrowRight'].includes(event.key);
      const shrink = ['-', 'ArrowDown', 'ArrowLeft'].includes(event.key);
      if (!grow && !shrink) return;
      const resizing = resizeGeometry(corner);
      resize(resizing, resizing.effectiveSize > 0 ? (resizing.effectiveSize + (grow ? 5 : -5)) / resizing.effectiveSize : 1);
    } else {
      const step = event.shiftKey ? 10 : 2;
      switch (event.key) {
        case 'ArrowLeft': state.x = clamp(state.x - step, 0, 100); break;
        case 'ArrowRight': state.x = clamp(state.x + step, 0, 100); break;
        case 'ArrowUp': state.y = clamp(state.y - step, 0, 100); break;
        case 'ArrowDown': state.y = clamp(state.y + step, 0, 100); break;
        case '+': case '=': state.size = clamp(state.size * fit + 5, 25, 200); break;
        case '-': state.size = clamp(state.size * fit - 5, 25, 200); break;
        case 'Home': event.preventDefault(); reset(); return;
        default: return;
      }
      refresh();
    }
    event.preventDefault();
    save();
  }) as EventListener);
  listen(window, 'resize', refresh);
  let observer: ResizeObserver | undefined;
  position.tabIndex = 0;
  for (const handle of handles) handle.tabIndex = -1;
  root.setAttribute('data-price-layout-ready', '');
  root.style.setProperty('--video-price-fit', '1');
  refresh();
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(refresh);
    observer.observe(position);
    observer.observe(stage);
  }

  return {
    refresh,
    destroy() {
      if (destroyed) return;
      finish(false);
      destroyed = true;
      clearFrameTimer();
      setFrame(false);
      observer?.disconnect();
      for (const remove of removeListeners) remove();
      root.removeAttribute('data-price-layout-ready');
      root.removeAttribute('data-price-default');
      for (const [name, value] of [['--video-price-scale', original.scale], ['--video-price-fit', original.fit]]) {
        if (value) root.style.setProperty(name, value); else root.style.removeProperty(name);
      }
      position.style.left = original.left;
      position.style.top = original.top;
      position.tabIndex = original.tabIndex;
      resetButton.disabled = original.resetDisabled;
      handles.forEach((handle, index) => { handle.tabIndex = original.handleTabIndexes[index]; });
    },
  };
}
