const IDLE_DELAY = 1200;
const INTERACTIVE = 'button, summary, input, select, textarea, a, [role="button"], [role="dialog"], [data-price-style], [data-price-position], [data-video-form]';
const EDITABLE_CONTROL = 'input:not([type="range"]), textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]';

/** Hide Video Mode's interface after inactivity, keeping active controls usable. */
export function createVideoControls(root: HTMLElement) {
  const dock = root.querySelector<HTMLElement>('.video-dock');
  const price = root.querySelector<HTMLElement>('[data-price-position]');
  const originalInert = dock?.inert ?? false;
  const cursor = window.matchMedia('(hover: hover) and (pointer: fine)');
  let enabled = false;
  let destroyed = false;
  let lastInput: 'keyboard' | 'pointer' | undefined;
  let openSelect: Element | null = null;
  let timer: number | undefined;
  let manuallyHidden = false;
  let revealedByTouch = false;

  function clearTimer() {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
  }

  function updatePlacement() {
    if (destroyed || !dock || !price) return;
    const controls = dock.getBoundingClientRect();
    const box = price.getBoundingClientRect();
    // Compare only the price with the dock's bottom home, even while docked at the top.
    const bottom = window.innerHeight - (Number.parseFloat(window.getComputedStyle(dock).marginBottom) || 0);
    // Require an overlap to move up; wait for a little clearance before returning.
    const gap = root.hasAttribute('data-video-controls-top') ? 24 : 0;
    const overlap = controls.width > 0 && controls.height > 0 && box.width > 0 && box.height > 0
      && box.left < controls.right + gap && box.right > controls.left - gap
      && box.top < bottom + gap && box.bottom > bottom - controls.height - gap;
    root.toggleAttribute('data-video-controls-top', overlap);
  }

  function handleLayoutChange() {
    updatePlacement();
    reveal();
  }

  function canFade() {
    if (!enabled || document.hidden) return false;
    if (root.hasAttribute('data-currency-open')) return false;
    if (root.hasAttribute('data-price-style-open')) return false;
    if (root.hasAttribute('data-price-dragging')) return false;
    if (document.documentElement.classList.contains('nav-menu-open') || document.querySelector('#site-navigation-dialog[open]')) return false;
    const active = document.activeElement;
    if (!active || !root.contains(active)) return true;
    // Native popups and editable fields must remain visible even after a mouse click.
    if (active === openSelect || active.matches(EDITABLE_CONTROL)) return false;
    // Pointer submission can transfer :focus-visible from the URL field to a button.
    return lastInput === 'pointer' || !active.matches(':focus-visible');
  }

  function reveal() {
    if (destroyed || manuallyHidden) return;
    clearTimer();
    root.removeAttribute('data-ui-idle');
    root.dispatchEvent(new Event('videouireveal'));
    scheduleIdle();
  }

  function scheduleIdle() {
    if (!canFade()) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!destroyed && canFade()) hide();
    }, IDLE_DELAY);
  }

  function restorePlayback() {
    if (destroyed || manuallyHidden) return;
    clearTimer();
    root.removeAttribute('data-ui-idle');
    // Do not reveal the editor again when focus is still on the price.
    scheduleIdle();
  }

  function handleEditorToggle() {
    const editing = root.hasAttribute('data-price-layout-open');
    if (dock) dock.inert = editing;
    if (!editing) restorePlayback();
  }

  function hide(manual = false) {
    clearTimer();
    manuallyHidden = true;
    openSelect = null;
    // Close the editor and menus before hiding; their close events cannot undo a manual dismissal.
    root.dispatchEvent(new Event('videouidismiss'));
    root.setAttribute('data-ui-idle', '');
    manuallyHidden = manual;
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    manuallyHidden = false;
    reveal();
  }

  function handlePointerDown(event: PointerEvent) {
    lastInput = 'pointer';
    const touch = event.pointerType === 'touch';
    revealedByTouch = touch && (manuallyHidden || root.hasAttribute('data-ui-idle'));
    if (touch) manuallyHidden = false;
    const select = (event.target as Element | null)?.closest?.('select');
    openSelect = select && root.contains(select) ? select : null;
    reveal();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && event.defaultPrevented) return;
    lastInput = 'keyboard';
    manuallyHidden = false;
    reveal();
  }

  function handleClick(event: MouseEvent) {
    if (destroyed || event.defaultPrevented) return;
    if (revealedByTouch) { revealedByTouch = false; return; }
    const target = event.target as Element | null;
    if (target?.closest?.('[data-price-position], [data-price-style]')) return;
    const editing = root.hasAttribute('data-price-layout-open');
    const background = !!target && root.contains(target) && !target.closest(INTERACTIVE);
    if (background && editing) {
      root.dispatchEvent(new Event('videouidismiss'));
      restorePlayback();
    } else if (background && enabled) hide(true);
  }

  function handleChangeOrBlur() {
    openSelect = null;
    reveal();
  }

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('click', handleClick);
  root.addEventListener('focusin', reveal);
  root.addEventListener('focusout', handleChangeOrBlur);
  root.addEventListener('change', handleChangeOrBlur);
  root.addEventListener('currencytoggle', reveal);
  root.addEventListener('pricestyletoggle', reveal);
  root.addEventListener('pricelayoutchange', handleLayoutChange);
  root.addEventListener('priceeditortoggle', handleEditorToggle);
  handleEditorToggle();
  document.addEventListener('visibilitychange', reveal);
  document.addEventListener('fullscreenchange', reveal);
  // Navigation moves its dialog outside the page root. These events do not bubble.
  document.addEventListener('toggle', reveal, true);
  document.addEventListener('close', reveal, true);
  cursor.addEventListener('change', reveal);
  window.addEventListener('resize', updatePlacement);
  updatePlacement();
  let observer: ResizeObserver | undefined;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(updatePlacement);
    if (price) observer.observe(price);
    if (dock) observer.observe(dock);
  }

  return {
    setEnabled(value: boolean) {
      if (destroyed || enabled === value) return;
      enabled = value;
      reveal();
    },
    reveal,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick);
      root.removeEventListener('focusin', reveal);
      root.removeEventListener('focusout', handleChangeOrBlur);
      root.removeEventListener('change', handleChangeOrBlur);
      root.removeEventListener('currencytoggle', reveal);
      root.removeEventListener('pricestyletoggle', reveal);
      root.removeEventListener('pricelayoutchange', handleLayoutChange);
      root.removeEventListener('priceeditortoggle', handleEditorToggle);
      if (dock) dock.inert = originalInert;
      document.removeEventListener('visibilitychange', reveal);
      document.removeEventListener('fullscreenchange', reveal);
      document.removeEventListener('toggle', reveal, true);
      document.removeEventListener('close', reveal, true);
      cursor.removeEventListener('change', reveal);
      window.removeEventListener('resize', updatePlacement);
      observer?.disconnect();
      clearTimer();
      root.removeAttribute('data-video-controls-top');
      root.removeAttribute('data-ui-idle');
    },
  };
}
