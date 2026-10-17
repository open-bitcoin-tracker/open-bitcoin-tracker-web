interface GuideSection {
  trigger: HTMLButtonElement;
  select: () => void;
}
interface GuideDrawerOptions {
  dialog: HTMLDialogElement;
  overview: HTMLElement;
  detail: HTMLElement;
  heading: HTMLElement | null;
  detailHeading: HTMLElement;
  detailBody: HTMLElement;
  overviewBody?: HTMLElement | null;
  back: HTMLButtonElement | null;
  closeButtons: HTMLButtonElement[];
  sections: GuideSection[];
  trigger?: HTMLElement;
  onClose?: () => void;
  deferDetailFocus?: boolean;
}

/** Native dialog lifecycle and two-panel navigation shared by Astro and React guides. */
export function createGuideDrawer({ dialog, overview, detail, heading, detailHeading, detailBody, overviewBody, back, closeButtons, sections, trigger, onClose, deferDetailFocus = false }: GuideDrawerOptions) {
  const narrow = window.matchMedia('(max-width: 899px)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const listeners: (() => void)[] = [];
  let active: GuideSection | undefined;
  let closing = false;
  let opened = false;
  let returnFocus: HTMLElement | null = null;
  let timeout: number | undefined;
  let focusFrame: number | undefined;

  function listen(target: EventTarget, type: string, callback: EventListener) {
    target.addEventListener(type, callback);
    listeners.push(() => target.removeEventListener(type, callback));
  }
  function update() {
    overview.inert = narrow.matches && !!active;
    detail.inert = !active;
    detail.setAttribute('aria-hidden', String(!active));
    sections.forEach(section => section.trigger.setAttribute('aria-expanded', String(section === active)));
  }
  function focusDetail() {
    const focus = () => {
      focusFrame = undefined;
      if (!dialog.open || !active) return;
      detailBody.scrollTop = 0;
      detailHeading.focus({ preventScroll: true });
    };
    if (focusFrame !== undefined) window.cancelAnimationFrame(focusFrame);
    // React must commit the selected content before its heading receives focus.
    if (deferDetailFocus) focusFrame = window.requestAnimationFrame(focus);
    else focus();
  }
  function closeDetail(restoreFocus = true) {
    if (focusFrame !== undefined) window.cancelAnimationFrame(focusFrame);
    focusFrame = undefined;
    const prior = active;
    active = undefined;
    dialog.removeAttribute('data-detail-open');
    update();
    if (restoreFocus) prior?.trigger.focus({ preventScroll: true });
  }
  function reset() {
    window.clearTimeout(timeout);
    timeout = undefined;
    closing = false;
    dialog.removeAttribute('data-closing');
    closeDetail(false);
  }
  function finishClose() {
    window.clearTimeout(timeout);
    timeout = undefined;
    dialog.close();
  }
  function close() {
    if (closing || !dialog.open) return;
    closing = true;
    if (reduced.matches) finishClose();
    else {
      dialog.setAttribute('data-closing', '');
      // Complete dismissal even if an animation is cancelled or motion changes.
      timeout = window.setTimeout(finishClose, 350);
    }
  }
  function open() {
    reset();
    returnFocus = trigger ?? document.activeElement as HTMLElement | null;
    opened = true;
    if (!dialog.open) dialog.showModal();
    if (overviewBody) overviewBody.scrollTop = 0;
    heading?.focus({ preventScroll: true });
  }
  sections.forEach(section => listen(section.trigger, 'click', () => {
    if (closing) return;
    if (active === section) { closeDetail(); return; }
    active = section;
    section.select();
    dialog.setAttribute('data-detail-open', '');
    update();
    focusDetail();
  }));
  if (back) listen(back, 'click', () => { if (!closing) closeDetail(); });
  closeButtons.forEach(button => listen(button, 'click', close));
  listen(narrow, 'change', () => {
    update();
    if (dialog.open && active) focusDetail();
  });
  listen(dialog, 'cancel', event => {
    event.preventDefault();
    if (closing) return;
    if (active) closeDetail();
    else close();
  });
  listen(dialog, 'click', event => { if (event.target === dialog) close(); });
  listen(dialog, 'animationend', ((event: AnimationEvent) => {
    if (closing && event.target === dialog && event.animationName === 'guide-drawer-out') finishClose();
  }) as EventListener);
  listen(dialog, 'close', () => {
    reset();
    if (!opened) return;
    opened = false;
    returnFocus?.focus({ preventScroll: true });
    onClose?.();
  });
  listen(dialog, 'keydown', ((event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')]
      .filter(element => !element.closest('[inert]') && element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1), focused = document.activeElement;
    if (event.shiftKey && (focused === first || focused === heading || focused === detailHeading)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && focused === detailHeading) {
      event.preventDefault(); (controls.find(control => detail.contains(control)) ?? first)?.focus();
    } else if (!event.shiftKey && (focused === last || focused === heading)) {
      event.preventDefault(); first?.focus();
    }
  }) as EventListener);
  update();
  return {
    open,
    close,
    destroy() {
      listeners.forEach(remove => remove());
      reset();
      if (opened) {
        opened = false;
        dialog.close();
        returnFocus?.focus({ preventScroll: true });
      }
    },
  };
}
