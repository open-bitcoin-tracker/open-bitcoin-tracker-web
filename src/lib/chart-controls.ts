const IDLE_DELAY = 1500;
const INITIAL_VISIBLE_DURATION = 3000;

/** Reveal chart controls on activity, on both touch and pointer devices. */
export function createChartControls(root: HTMLElement) {
  const initialVisibleUntil = performance.now() + INITIAL_VISIBLE_DURATION;
  const settings = root.querySelector<HTMLDetailsElement>('[data-chart-settings]');
  const navigationTrigger = document.querySelector<HTMLElement>('.nav-menu-trigger');
  const pointers = new Set<number>();
  const removeListeners: (() => void)[] = [];
  let timer: number | undefined;
  let destroyed = false;
  let keyboard = false;

  function listen(target: EventTarget, type: string, listener: EventListener, capture = false) {
    target.addEventListener(type, listener, capture);
    removeListeners.push(() => target.removeEventListener(type, listener, capture));
  }

  function clearTimer() {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
  }

  function canFade() {
    if (document.hidden || pointers.size || settings?.open || root.hasAttribute('data-currency-open')) return false;
    if (document.querySelector('#site-navigation-dialog[open]')) return false;
    const active = document.activeElement;
    return !keyboard || !active || (!root.contains(active) && active !== navigationTrigger) || !active.matches(':focus-visible');
  }

  function reveal() {
    if (destroyed) return;
    clearTimer();
    if (document.hidden) return;
    root.removeAttribute('data-chart-ui-idle');
    if (!canFade()) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!destroyed && canFade()) root.setAttribute('data-chart-ui-idle', '');
    }, Math.max(IDLE_DELAY, initialVisibleUntil - performance.now()));
  }

  function pointerDown(event: PointerEvent) {
    keyboard = false;
    pointers.add(event.pointerId);
    reveal();
  }

  function pointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId);
    reveal();
  }

  function keyDown() {
    keyboard = true;
    reveal();
  }

  function visibility() {
    pointers.clear();
    clearTimer();
    root.setAttribute('data-chart-ui-idle', '');
  }

  listen(window, 'pointermove', reveal);
  listen(window, 'pointerdown', pointerDown as EventListener);
  listen(window, 'pointerup', pointerUp as EventListener);
  listen(window, 'pointercancel', pointerUp as EventListener);
  listen(window, 'keydown', keyDown);
  listen(window, 'blur', visibility);
  listen(document, 'focusin', reveal);
  listen(document, 'focusout', reveal);
  listen(root, 'currencytoggle', reveal);
  listen(document, 'toggle', reveal, true);
  listen(document, 'close', reveal, true);
  listen(document, 'visibilitychange', visibility);
  listen(document, 'fullscreenchange', reveal);
  reveal();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimer();
      for (const remove of removeListeners) remove();
      pointers.clear();
      root.removeAttribute('data-chart-ui-idle');
    },
  };
}
