const IDLE_DELAY = 3000;

/** Fade fullscreen chart controls while preserving menus and keyboard access. */
export function createChartFullscreenControls(root: HTMLElement) {
  const navigationTrigger = document.querySelector<HTMLElement>('.nav-menu-trigger');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let revealUntil = 0;
  let keyboardNavigation = false;

  function clearTimer() {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  }

  function canFade() {
    if (!document.fullscreenElement || document.hidden) return false;
    if (root.querySelector('[data-chart-settings][open], dialog[open], [data-range-bar][data-dragging="true"]')) return false;
    // Navigation moves its modal outside the chart root.
    if (document.querySelector('#site-navigation-dialog[open]')) return false;
    const active = document.activeElement;
    return !keyboardNavigation || !active || (!root.contains(active) && !navigationTrigger?.contains(active)) || !active.matches(':focus-visible');
  }

  function sync() {
    clearTimer();
    if (!document.fullscreenElement) {
      root.removeAttribute('data-fullscreen-idle');
      return;
    }
    // Focus, menu, and visibility events cannot reveal an idle fullscreen chart.
    if (root.hasAttribute('data-fullscreen-idle')) return;
    if (!canFade()) return;
    const remaining = revealUntil - Date.now();
    if (remaining <= 0) root.setAttribute('data-fullscreen-idle', '');
    else timer = setTimeout(sync, remaining);
  }

  function reveal() {
    if (!document.fullscreenElement) return;
    revealUntil = Date.now() + IDLE_DELAY;
    root.removeAttribute('data-fullscreen-idle');
    sync();
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerType !== 'touch') reveal();
  }

  function handleFocusOut() {
    // Focus still points to the old control until the focusout event completes.
    clearTimer();
    timer = setTimeout(sync, 0);
  }

  function handleFullscreenChange() {
    clearTimer();
    revealUntil = 0;
    keyboardNavigation = false;
    if (document.fullscreenElement) root.setAttribute('data-fullscreen-idle', '');
    else root.removeAttribute('data-fullscreen-idle');
  }

  function handlePointerDown() {
    keyboardNavigation = false;
    sync();
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Keep deliberate keyboard navigation usable without revealing on entry focus.
    if (event.key !== 'Tab') return;
    keyboardNavigation = true;
    reveal();
  }

  function handlePanelChange(event: Event) {
    const target = event.target as Element | null;
    if (!target || (!root.contains(target) && target.id !== 'site-navigation-dialog')) return;
    sync();
  }

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointerup', sync);
  window.addEventListener('pointercancel', sync);
  window.addEventListener('keydown', handleKeyDown);
  document.addEventListener('focusin', sync);
  document.addEventListener('focusout', handleFocusOut);
  document.addEventListener('toggle', handlePanelChange, true);
  document.addEventListener('close', handlePanelChange, true);
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  handleFullscreenChange();

  return {
    destroy() {
      clearTimer();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', sync);
      window.removeEventListener('pointercancel', sync);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('toggle', handlePanelChange, true);
      document.removeEventListener('close', handlePanelChange, true);
      document.removeEventListener('visibilitychange', sync);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      root.removeAttribute('data-fullscreen-idle');
    },
  };
}
