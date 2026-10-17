/** Progressive enhancement for native disclosures; links and buttons keep their own semantics. */
export function createDisclosureMenu(menu: HTMLDetailsElement) {
  const trigger = menu.querySelector<HTMLElement>('summary')!;
  const listeners: (() => void)[] = [];
  function listen(target: EventTarget, type: string, callback: EventListener) {
    target.addEventListener(type, callback);
    listeners.push(() => target.removeEventListener(type, callback));
  }
  function close(restoreFocus = false) {
    menu.open = false;
    if (trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  listen(menu, 'toggle', () => {
    if (trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', String(menu.open));
  });
  listen(menu, 'keydown', ((event: KeyboardEvent) => {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (!menu.hasAttribute('data-menu-navigation')) return;
    const options = [...menu.querySelectorAll<HTMLElement>('[data-menu-option]')];
    if (!options.length) return;
    const active = options.indexOf(document.activeElement as HTMLElement);
    const selected = Math.max(0, options.findIndex(option => option.matches('[aria-pressed="true"], [aria-current="true"]')));
    let next = -1;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else if (event.key === 'ArrowDown') next = active < 0 ? selected : (active + 1) % options.length;
    else if (event.key === 'ArrowUp') next = active < 0 ? selected : (active + options.length - 1) % options.length;
    else if (event.key.length === 1 && event.key !== ' ' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      for (let step = 1; step <= options.length; step++) {
        const index = (active + step) % options.length;
        if (options[index].textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase())) { next = index; break; }
      }
    }
    if (next >= 0) {
      event.preventDefault();
      menu.open = true;
      if (trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'true');
      options[next].focus({ preventScroll: true });
    }
  }) as EventListener);
  listen(document, 'click', event => { if (menu.open && !menu.contains(event.target as Node)) close(); });
  listen(document, 'focusin', () => { if (menu.open && !menu.contains(document.activeElement)) close(); });
  listen(menu, 'focusout', ((event: FocusEvent) => {
    if (!menu.contains(event.relatedTarget as Node | null)) close();
  }) as EventListener);
  if (menu.hasAttribute('data-menu-close-on-select')) {
    menu.querySelectorAll('a, button').forEach(option => listen(option, 'click', () => close(true)));
  }
  return { close, destroy() { listeners.forEach(remove => remove()); } };
}
