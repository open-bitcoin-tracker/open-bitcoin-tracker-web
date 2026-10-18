const IDLE_DELAY = 3000;
const REVEAL_DURATION = 250;
const INTERACTIVE = 'button, summary, input, select, textarea, a, [role="button"], [role="dialog"], [data-price-style], [data-price-position], [data-video-form]';
const EDITABLE_CONTROL = 'input:not([type="range"]), textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]';

/** Hide Price on Video's interface after inactivity, keeping active controls usable. */
export function createVideoControls(root: HTMLElement) {
  const price = root.querySelector<HTMLElement>('[data-price-position]');
  const cursor = window.matchMedia('(hover: hover) and (pointer: fine)');
  let enabled = false;
  let destroyed = false;
  let lastInput: 'keyboard' | 'pointer' | undefined;
  let openSelect: Element | null = null;
  let timer: number | undefined;
  let manuallyHidden = false;
  let revealOnlyClick = false;
  let pointerRevealUntil = 0;

  function clearTimer() {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
  }

  function updatePlacement() {
    if (destroyed || !price) return;
    const box = price.getBoundingClientRect();
    // Use the price center, independent of its menu and the playback panel's size.
    const inLowerScreen = box.height > 0 && box.top + box.height / 2 >= window.innerHeight * .6;
    root.toggleAttribute('data-video-controls-top', inLowerScreen);
  }

  function handleLayoutChange() {
    updatePlacement();
    reveal();
  }

  function canFade() {
    if (!enabled || document.hidden) return false;
    if (root.hasAttribute('data-price-layout-open')) return false;
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
    restorePlayback();
  }

  function hide(manual = false) {
    clearTimer();
    manuallyHidden = true;
    openSelect = null;
    // Close the editor and menus before hiding; their close events cannot undo a manual dismissal.
    root.dispatchEvent(new Event('videouidismiss'));
    root.setAttribute('data-ui-idle', '');
    // Fullscreen stays quiet until an intentional tap or keyboard navigation.
    manuallyHidden = manual || !!document.fullscreenElement;
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch' || document.fullscreenElement) return;
    // Mouse clicks can first emit a move; protect the tap during the UI fade-in.
    if (manuallyHidden || root.hasAttribute('data-ui-idle')) pointerRevealUntil = Date.now() + REVEAL_DURATION;
    manuallyHidden = false;
    reveal();
  }

  function handlePointerDown(event: PointerEvent) {
    lastInput = 'pointer';
    revealOnlyClick = manuallyHidden || root.hasAttribute('data-ui-idle') || Date.now() < pointerRevealUntil;
    pointerRevealUntil = 0;
    manuallyHidden = false;
    const select = (event.target as Element | null)?.closest?.('select');
    openSelect = select && root.contains(select) ? select : null;
    reveal();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && event.defaultPrevented) return;
    if (document.fullscreenElement && manuallyHidden && event.key !== 'Tab') return;
    lastInput = 'keyboard';
    manuallyHidden = false;
    reveal();
  }

  function consumeRevealClick(event: MouseEvent) {
    if (destroyed || event.defaultPrevented) return;
    if (!revealOnlyClick && !root.hasAttribute('data-ui-idle')) return;
    revealOnlyClick = false;
    manuallyHidden = false;
    reveal();
    event.preventDefault();
    event.stopPropagation();
  }

  function handleClick(event: MouseEvent) {
    if (destroyed || event.defaultPrevented) return;
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

  function handleFullscreenChange() {
    if (destroyed) return;
    pointerRevealUntil = 0;
    revealOnlyClick = false;
    if (document.fullscreenElement) hide(true);
    else {
      manuallyHidden = false;
      reveal();
    }
  }

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerdown', handlePointerDown, true);
  root.addEventListener('click', consumeRevealClick, true);
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
  document.addEventListener('fullscreenchange', handleFullscreenChange);
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
      window.removeEventListener('pointerdown', handlePointerDown, true);
      root.removeEventListener('click', consumeRevealClick, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick);
      root.removeEventListener('focusin', reveal);
      root.removeEventListener('focusout', handleChangeOrBlur);
      root.removeEventListener('change', handleChangeOrBlur);
      root.removeEventListener('currencytoggle', reveal);
      root.removeEventListener('pricestyletoggle', reveal);
      root.removeEventListener('pricelayoutchange', handleLayoutChange);
      root.removeEventListener('priceeditortoggle', handleEditorToggle);
      document.removeEventListener('visibilitychange', reveal);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
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
