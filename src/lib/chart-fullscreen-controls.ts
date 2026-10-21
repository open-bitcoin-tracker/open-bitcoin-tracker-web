const IDLE_DELAY = 3000;

/** Fade fullscreen chart controls while preserving menus and keyboard access. */
export function createChartFullscreenControls(root: HTMLElement) {
  const navigationTrigger = document.querySelector<HTMLElement>('.nav-menu-trigger');
  let timer: ReturnType<typeof setTimeout> | undefined;

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
    return !active || (!root.contains(active) && !navigationTrigger?.contains(active)) || !active.matches(':focus-visible');
  }

  function reveal() {
    clearTimer();
    root.removeAttribute('data-fullscreen-idle');
    if (!canFade()) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (canFade()) root.setAttribute('data-fullscreen-idle', '');
    }, IDLE_DELAY);
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerType !== 'touch') reveal();
  }

  function handleFocusOut() {
    // Focus still points to the old control until the focusout event completes.
    clearTimer();
    timer = setTimeout(reveal, 0);
  }

  function handleFullscreenChange() {
    clearTimer();
    if (canFade()) root.setAttribute('data-fullscreen-idle', '');
    else reveal();
  }

  function handlePanelChange(event: Event) {
    const target = event.target as Element | null;
    if (!target || (!root.contains(target) && target.id !== 'site-navigation-dialog')) return;
    // A settings-close event queued before fullscreen entry must not undo its fade.
    if (root.hasAttribute('data-fullscreen-idle') && canFade()) return;
    reveal();
  }

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerdown', reveal);
  window.addEventListener('pointerup', reveal);
  window.addEventListener('pointercancel', reveal);
  window.addEventListener('keydown', reveal);
  document.addEventListener('focusin', reveal);
  document.addEventListener('focusout', handleFocusOut);
  document.addEventListener('toggle', handlePanelChange, true);
  document.addEventListener('close', handlePanelChange, true);
  document.addEventListener('visibilitychange', reveal);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  handleFullscreenChange();

  return {
    destroy() {
      clearTimer();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', reveal);
      window.removeEventListener('pointerup', reveal);
      window.removeEventListener('pointercancel', reveal);
      window.removeEventListener('keydown', reveal);
      document.removeEventListener('focusin', reveal);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('toggle', handlePanelChange, true);
      document.removeEventListener('close', handlePanelChange, true);
      document.removeEventListener('visibilitychange', reveal);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      root.removeAttribute('data-fullscreen-idle');
    },
  };
}
