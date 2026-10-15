const IDLE_DELAY = 1200;
const INTERACTIVE = 'button, input, select, textarea, a, [role="button"], [role="dialog"], [data-price-style], [data-price-position], [data-video-form]';
const EDITABLE_CONTROL = 'input:not([type="range"]), textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]';

/** Hide Video Mode's interface while a cursor is idle, keeping active controls usable. */
export function createVideoControls(root: HTMLElement) {
  const cursor = window.matchMedia('(hover: hover) and (pointer: fine)');
  let enabled = false;
  let destroyed = false;
  let touch = false;
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

  function canFade() {
    if (!enabled || !cursor.matches || touch || document.hidden) return false;
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
    if (!canFade()) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!destroyed && canFade()) hide();
    }, IDLE_DELAY);
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
    touch = false;
    manuallyHidden = false;
    reveal();
  }

  function handlePointerDown(event: PointerEvent) {
    lastInput = 'pointer';
    touch = event.pointerType === 'touch';
    revealedByTouch = touch && manuallyHidden;
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
    if (destroyed) return;
    if (revealedByTouch) { revealedByTouch = false; return; }
    const target = event.target as Element | null;
    if (target?.closest?.('[data-price-position], [data-price-style]')) return;
    const editing = root.hasAttribute('data-price-layout-open');
    const background = !!target && root.contains(target) && !target.closest(INTERACTIVE);
    if (background && (editing || enabled)) hide(true);
  }

  function dismiss() { hide(true); }

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
  root.addEventListener('pricelayoutchange', reveal);
  root.addEventListener('videouihide', dismiss);
  document.addEventListener('visibilitychange', reveal);
  document.addEventListener('fullscreenchange', reveal);
  // Navigation moves its dialog outside the page root. These events do not bubble.
  document.addEventListener('toggle', reveal, true);
  document.addEventListener('close', reveal, true);
  cursor.addEventListener('change', reveal);

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
      root.removeEventListener('pricelayoutchange', reveal);
      root.removeEventListener('videouihide', dismiss);
      document.removeEventListener('visibilitychange', reveal);
      document.removeEventListener('fullscreenchange', reveal);
      document.removeEventListener('toggle', reveal, true);
      document.removeEventListener('close', reveal, true);
      cursor.removeEventListener('change', reveal);
      clearTimer();
      root.removeAttribute('data-ui-idle');
    },
  };
}
