const STORAGE_KEY = 'obt-video-price-layout';
const PADDING = 0;
const HOVER_PADDING = 24;
const HOVER_VERTICAL_PADDING = 96;
const SNAP_DISTANCE = 8;
const SNAP_RELEASE_DISTANCE = 16;
const CLICK_DRAG_DISTANCE = 4;
const DEFAULTS = { version: 1, x: 50, y: 50, size: 100 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Resize = { corner: Corner; centered: boolean; width: number; height: number; anchorX: number; anchorY: number; effectiveSize: number };
type Operation = { pointerId: number; capture: HTMLElement; clientX: number; clientY: number; moved: boolean } & (
  { kind: 'move'; grabX: number; grabY: number }
  | ({ kind: 'resize'; lastClientX: number; lastClientY: number } & Resize)
);

/** Move and resize the live price without changing playback or currency settings. */
export function createVideoPriceLayout(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('[data-price-stage]')!;
  const position = root.querySelector<HTMLElement>('[data-price-position]')!;
  const styleControls = root.querySelector<HTMLElement>('[data-price-style]')!;
  const menu = root.querySelector<HTMLElement>('[data-price-settings-panel]');
  const resetButton = root.querySelector<HTMLButtonElement>('[data-reset-price]')!;
  const handles = [...position.querySelectorAll<HTMLButtonElement>('[data-price-resize]')];
  const original = {
    scale: root.style.getPropertyValue('--video-price-scale'), fit: root.style.getPropertyValue('--video-price-fit'),
    left: position.style.left, top: position.style.top, tabIndex: position.tabIndex,
    handleTabIndexes: handles.map(handle => handle.tabIndex),
    resetDisabled: resetButton.disabled, resetHidden: resetButton.hidden,
  };
  const removeListeners: (() => void)[] = [];
  let state = { ...DEFAULTS };
  let fit = 1;
  let appliedScale: number | undefined;
  let destroyed = false;
  let frame = false;
  let dismissed = false;
  let hovered = false;
  let touchEditing = false;
  let lastInput: 'keyboard' | 'pointer' | undefined;
  let operation: Operation | undefined;
  let suppressClick = false;
  let snappedX = false;
  let snappedY = false;

  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved?.version === 1 && ['x', 'y', 'size'].every(axis => typeof saved[axis] === 'number' && Number.isFinite(saved[axis]))) {
      state = { version: 1, x: clamp(saved.x, 0, 100), y: clamp(saved.y, 0, 100), size: Math.max(25, saved.size) };
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
    const centered = Math.abs(state.x - 50) <= .01 && Math.abs(state.y - 50) <= .01;
    const isDefault = centered && Math.abs(state.size - 100) <= .01;
    root.toggleAttribute('data-price-default', isDefault);
    resetButton.disabled = resetButton.hidden = isDefault && !root.hasAttribute('data-price-style-custom');
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
      const next = clamp(fit * ratio, Number.MIN_VALUE, 1);
      if (Math.abs(next - fit) <= fit * .000001) break;
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
  function setSnapping(x: boolean, y: boolean) {
    snappedX = x;
    snappedY = y;
    root.toggleAttribute('data-price-snap-x', x);
    root.toggleAttribute('data-price-snap-y', y);
  }
  function drag(left: number, top: number) {
    const { startX, startY, travelX, travelY } = geometry();
    const centerX = startX + travelX / 2, centerY = startY + travelY / 2;
    // A wider release distance keeps the guides steady with small hand movements.
    const x = travelX > 0 && Math.abs(left - centerX) <= (snappedX ? SNAP_RELEASE_DISTANCE : SNAP_DISTANCE);
    const y = travelY > 0 && Math.abs(top - centerY) <= (snappedY ? SNAP_RELEASE_DISTANCE : SNAP_DISTANCE);
    setSnapping(x, y);
    place(x ? centerX : left, y ? centerY : top);
  }
  function keyboardFocus() {
    const active = document.activeElement;
    return lastInput !== 'pointer' && !!active && (position.contains(active) || styleControls.contains(active)) && active.matches(':focus-visible');
  }
  const inStyle = (target: EventTarget | null) => !!(target as Element | null)?.closest?.('[data-price-style]');
  function setFrame(visible: boolean) {
    if (frame === visible) return;
    frame = visible;
    root.toggleAttribute('data-price-layout-open', visible);
    for (const handle of handles) handle.tabIndex = visible ? 0 : -1;
    root.dispatchEvent(new Event('priceeditortoggle'));
  }
  function withinHoverZone(event: PointerEvent) {
    const box = position.getBoundingClientRect();
    const controls = styleControls.getBoundingClientRect();
    const menuBox = menu && !menu.hidden ? menu.getBoundingClientRect() : undefined;
    const inside = (left: number, top: number, width: number, height: number, verticalPadding: number) =>
      event.clientX >= left - HOVER_PADDING && event.clientX <= left + width + HOVER_PADDING
      && event.clientY >= top - verticalPadding && event.clientY <= top + height + verticalPadding;
    return inside(box.left, box.top, box.width, box.height, HOVER_VERTICAL_PADDING)
      || inside(controls.left, controls.top, controls.width, controls.height, HOVER_PADDING)
      || !!menuBox && inside(menuBox.left, menuBox.top, menuBox.width, menuBox.height, HOVER_PADDING);
  }
  function revealFrame() {
    if (destroyed) return;
    if (document.fullscreenElement && root.hasAttribute('data-ui-idle')) { setFrame(false); return; }
    setFrame(!dismissed && !document.hidden && (hovered || touchEditing || !!operation || root.hasAttribute('data-price-settings-open') || root.hasAttribute('data-price-style-open') || root.hasAttribute('data-currency-open') || keyboardFocus()));
  }
  function resizeGeometry(corner: Corner, centered = false): Resize {
    const { viewport, box } = geometry();
    return {
      corner, centered, width: box.width, height: box.height, effectiveSize: state.size * fit,
      anchorX: box.left - viewport.left + box.width * (centered ? .5 : corner.endsWith('w') ? 1 : 0),
      anchorY: box.top - viewport.top + box.height * (centered ? .5 : corner.startsWith('n') ? 1 : 0),
    };
  }
  function resize(resizing: Resize, ratio: number) {
    const { viewport } = geometry();
    const west = resizing.corner.endsWith('w'), north = resizing.corner.startsWith('n');
    const maxWidth = resizing.centered ? Math.min(resizing.anchorX - PADDING, viewport.width - PADDING - resizing.anchorX) * 2
      : west ? resizing.anchorX - PADDING : viewport.width - PADDING - resizing.anchorX;
    const maxHeight = resizing.centered ? Math.min(resizing.anchorY - PADDING, viewport.height - PADDING - resizing.anchorY) * 2
      : north ? resizing.anchorY - PADDING : viewport.height - PADDING - resizing.anchorY;
    const maxRatio = Math.max(0, Math.min(resizing.width > 0 ? maxWidth / resizing.width : 1, resizing.height > 0 ? maxHeight / resizing.height : 1));
    state.size = Math.max(25, resizing.effectiveSize * Math.min(maxRatio, Math.max(0, ratio)));
    refresh();
    const box = position.getBoundingClientRect();
    place(resizing.anchorX - box.width * (resizing.centered ? .5 : west ? 1 : 0),
      resizing.anchorY - box.height * (resizing.centered ? .5 : north ? 1 : 0));
  }
  function finish(persist = true) {
    if (!operation) return;
    const { pointerId, capture } = operation;
    operation = undefined;
    try { if (capture.hasPointerCapture(pointerId)) capture.releasePointerCapture(pointerId); } catch { /* Capture may already be released. */ }
    root.removeAttribute('data-price-dragging');
    root.removeAttribute('data-price-resizing');
    setSnapping(false, false);
    notify();
    if (persist) save();
    revealFrame();
  }
  function move(event: PointerEvent) {
    if (destroyed || !operation || operation.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (operation.kind === 'resize' && operation.centered !== !!event.shiftKey) {
      // Switch anchors at the current box, preserving movement since the last event.
      Object.assign(operation, resizeGeometry(operation.corner, !!event.shiftKey), {
        clientX: operation.lastClientX, clientY: operation.lastClientY,
      });
    }
    const dx = event.clientX - operation.clientX, dy = event.clientY - operation.clientY;
    suppressClick ||= Math.hypot(dx, dy) > CLICK_DRAG_DISTANCE;
    const changed = Math.abs(dx) + Math.abs(dy) >= .001;
    if (!operation.moved && !changed) return;
    operation.moved ||= changed;
    if (operation.kind === 'move') {
      const { viewport } = geometry();
      drag(event.clientX - viewport.left - operation.grabX, event.clientY - viewport.top - operation.grabY);
    } else {
      const width = operation.width * (operation.corner.endsWith('w') ? -1 : 1);
      const height = operation.height * (operation.corner.startsWith('n') ? -1 : 1);
      const diagonal = width * width + height * height;
      resize(operation, diagonal > 0 ? 1 + (operation.centered ? 2 : 1) * (dx * width + dy * height) / diagonal : 1);
      operation.lastClientX = event.clientX;
      operation.lastClientY = event.clientY;
    }
  }
  function stopForInactivePage() {
    hovered = touchEditing = false;
    finish();
    setFrame(false);
  }
  function reset() {
    const restoreFocus = document.activeElement === resetButton;
    finish(false);
    state = { ...DEFAULTS };
    root.dispatchEvent(new Event('pricerestore'));
    refresh();
    notify();
    save();
    dismissed = false;
    revealFrame();
    if (restoreFocus) position.focus({ preventScroll: true });
  }

  listen(resetButton, 'click', reset);
  listen(root, 'videouidismiss', () => {
    finish();
    dismissed = true;
    hovered = touchEditing = false;
    setFrame(false);
  });
  listen(root, 'videouireveal', () => {
    dismissed = false;
    revealFrame();
  });
  const hover = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || document.fullscreenElement) return;
    hovered = true;
    touchEditing = false;
    lastInput = 'pointer';
    dismissed = false;
    revealFrame();
  };
  listen(position, 'pointerenter', hover as EventListener);
  listen(position, 'pointermove', hover as EventListener);
  listen(position, 'pointerleave', ((event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    hovered = hovered && withinHoverZone(event);
    revealFrame();
  }) as EventListener);
  listen(position, 'pointerdown', ((event: PointerEvent) => {
    if (inStyle(event.target)) return;
    if (operation || !event.isPrimary || event.button !== 0) return;
    lastInput = 'pointer';
    touchEditing = event.pointerType === 'touch';
    hovered = !touchEditing;
    dismissed = false;
    event.preventDefault();
    const handle = (event.target as Element | null)?.closest<HTMLElement>('[data-price-resize]');
    const corner = handle?.dataset.priceResize as Corner | undefined;
    const box = position.getBoundingClientRect();
    operation = corner && ['nw', 'ne', 'sw', 'se'].includes(corner) && position.contains(handle!)
      ? { kind: 'resize', pointerId: event.pointerId, capture: position, clientX: event.clientX, clientY: event.clientY,
        lastClientX: event.clientX, lastClientY: event.clientY, moved: false, ...resizeGeometry(corner, !!event.shiftKey) }
      : { kind: 'move', pointerId: event.pointerId, capture: position, clientX: event.clientX, clientY: event.clientY, moved: false, grabX: event.clientX - box.left, grabY: event.clientY - box.top };
    suppressClick = operation.kind === 'resize';
    (handle ?? position).focus({ preventScroll: true });
    setFrame(true);
    try { position.setPointerCapture(event.pointerId); } catch { /* Window listeners also support uncaptured dragging. */ }
    root.setAttribute('data-price-dragging', '');
    if (operation.kind === 'resize') root.setAttribute('data-price-resizing', operation.corner);
    notify();
  }) as EventListener);
  listen(position, 'click', event => {
    if (inStyle(event.target)) return;
    dismissed = false;
    revealFrame();
    // Pointer capture can target this element with a click after moving/resizing.
    // Let the page toggle playback only for an ordinary click or tap.
    if (suppressClick) event.preventDefault();
    suppressClick = false;
  });
  listen(window, 'pointermove', ((event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      lastInput = 'pointer';
      touchEditing = false;
      if (!position.contains(event.target as Node | null)) hovered = (hovered || frame) && withinHoverZone(event);
      revealFrame();
    }
    move(event);
  }) as EventListener);
  listen(window, 'pointerup', ((event: PointerEvent) => {
    if (operation?.pointerId !== event.pointerId) return;
    move(event);
    if (event.pointerType !== 'touch') {
      hovered = withinHoverZone(event);
    }
    finish();
  }) as EventListener);
  const cancel = (event: PointerEvent) => { if (operation?.pointerId === event.pointerId) finish(); };
  listen(window, 'pointercancel', cancel as EventListener);
  listen(position, 'lostpointercapture', cancel as EventListener);
  listen(window, 'blur', stopForInactivePage);
  listen(document, 'visibilitychange', () => { if (document.hidden) stopForInactivePage(); else revealFrame(); });
  listen(window, 'focus', revealFrame);
  listen(window, 'keydown', ((event: KeyboardEvent) => {
    lastInput = 'keyboard';
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      // The navigation dialog lives outside the page root and owns its Escape.
      if (!root.contains(event.target as Node | null)) return;
      if (!frame && !operation) return;
      event.preventDefault();
      finish();
      if (handles.some(handle => handle === document.activeElement)) position.focus({ preventScroll: true });
      dismissed = true;
      setFrame(false);
      return;
    }
    dismissed = false;
    if (keyboardFocus()) revealFrame();
  }) as EventListener);
  listen(root, 'pricesettingstoggle', revealFrame);
  listen(root, 'pricestyletoggle', revealFrame);
  listen(root, 'currencytoggle', revealFrame);
  const focusIn = () => { if (keyboardFocus()) revealFrame(); };
  listen(position, 'focusin', focusIn);
  listen(styleControls, 'focusin', focusIn);
  const focusOut = ((event: FocusEvent) => {
    if (!position.contains(event.relatedTarget as Node | null) && !styleControls.contains(event.relatedTarget as Node | null)
      && !hovered && !touchEditing && !operation && !root.hasAttribute('data-price-settings-open') && !root.hasAttribute('data-price-style-open') && !root.hasAttribute('data-currency-open')) setFrame(false);
  }) as EventListener;
  listen(position, 'focusout', focusOut);
  listen(styleControls, 'focusout', focusOut);
  listen(position, 'keydown', ((event: KeyboardEvent) => {
    if (inStyle(event.target)) return;
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
      const resizing = resizeGeometry(corner, event.shiftKey);
      resize(resizing, resizing.effectiveSize > 0 ? (resizing.effectiveSize + (grow ? 5 : -5)) / resizing.effectiveSize : 1);
    } else {
      const step = event.shiftKey ? 10 : 2;
      switch (event.key) {
        case 'ArrowLeft': state.x = clamp(state.x - step, 0, 100); break;
        case 'ArrowRight': state.x = clamp(state.x + step, 0, 100); break;
        case 'ArrowUp': state.y = clamp(state.y - step, 0, 100); break;
        case 'ArrowDown': state.y = clamp(state.y + step, 0, 100); break;
        case '+': case '=': state.size = Math.max(25, state.size * fit + 5); break;
        case '-': state.size = Math.max(25, state.size * fit - 5); break;
        case 'Home': event.preventDefault(); reset(); return;
        default: return;
      }
      refresh();
    }
    event.preventDefault();
    notify();
    save();
  }) as EventListener);
  listen(window, 'resize', refresh);
  let observer: ResizeObserver | undefined;
  position.tabIndex = 0;
  for (const handle of handles) handle.tabIndex = -1;
  root.setAttribute('data-price-layout-ready', '');
  root.style.setProperty('--video-price-fit', '1');
  refresh();
  revealFrame();
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
      resetButton.hidden = original.resetHidden;
      handles.forEach((handle, index) => { handle.tabIndex = original.handleTabIndexes[index]; });
    },
  };
}
