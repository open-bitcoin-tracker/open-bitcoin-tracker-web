/** A keyboard-accessible currency menu backed by the page's existing select. */
export function createVideoCurrencyPicker(root: HTMLElement, select: HTMLSelectElement, { panel, back }: { panel?: HTMLElement; back?: HTMLButtonElement } = {}) {
  const wrapper = root.querySelector<HTMLElement>('[data-currency-picker]')!;
  const trigger = wrapper.querySelector<HTMLButtonElement>('[data-currency-trigger]')!;
  const value = wrapper.querySelector<HTMLElement>('[data-currency-value]')!;
  const list = wrapper.querySelector<HTMLElement>('[data-currency-list]')!;
  const options = [...list.querySelectorAll<HTMLButtonElement>('[data-currency-option]')];
  const removeListeners: (() => void)[] = [];
  let open = false;
  let destroyed = false;
  let activeIndex = -1;
  let search = '';
  let lastSearch = 0;

  function listen(target: EventTarget, type: string, listener: EventListener) {
    target.addEventListener(type, listener);
    removeListeners.push(() => target.removeEventListener(type, listener));
  }

  function focusOption(index: number) {
    if (index < 0 || index >= options.length) return;
    activeIndex = index;
    options.forEach((option, position) => { option.tabIndex = position === index ? 0 : -1; });
    options[index].focus();
  }

  function close(restoreFocus = false) {
    if (!open) return;
    open = false;
    search = '';
    list.hidden = true;
    if (panel) panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    options.forEach(option => { option.tabIndex = -1; });
    root.removeAttribute('data-currency-open');
    root.dispatchEvent(new Event('currencytoggle'));
    if (restoreFocus && !trigger.disabled) trigger.focus();
  }

  function show(index?: number) {
    if (destroyed || trigger.disabled || !options.length) return;
    if (!open) {
      open = true;
      list.hidden = false;
      if (panel) panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      root.setAttribute('data-currency-open', '');
      root.dispatchEvent(new Event('currencytoggle'));
    }
    const selected = options.findIndex(option => option.dataset.currencyOption === select.value);
    focusOption(index ?? (selected < 0 ? 0 : selected));
  }

  function sync() {
    value.textContent = select.value;
    trigger.disabled = select.disabled;
    options.forEach(option => option.setAttribute('aria-selected', String(option.dataset.currencyOption === select.value)));
    if (trigger.disabled) close();
  }

  function choose(option: HTMLButtonElement) {
    if (destroyed || select.disabled || option.disabled) return;
    select.value = option.dataset.currencyOption!;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close(true);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (destroyed || trigger.disabled) return;
    const fromTrigger = event.target === trigger;
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); close(true); }
      return;
    }
    // A standalone currency panel can share its wrapper with other settings.
    if (!trigger.contains(event.target as Node) && !list.contains(event.target as Node)) return;
    if (open && !fromTrigger && (event.key === 'Enter' || event.key === ' ')) {
      const option = options.find(option => option === event.target);
      if (option) { event.preventDefault(); choose(option); }
      return;
    }
    let next: number | undefined;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open || fromTrigger) {
        next = options.findIndex(option => option.dataset.currencyOption === select.value);
        if (next < 0) next = event.key === 'ArrowUp' ? options.length - 1 : 0;
      } else next = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    }
    if (next !== undefined) {
      event.preventDefault();
      search = '';
      show(next);
      return;
    }
    // Printable keys only move focus; activation commits the selected currency.
    if (event.key.length !== 1 || event.key === ' ' || event.ctrlKey || event.altKey || event.metaKey) return;
    const now = Date.now();
    const letter = event.key.toLowerCase();
    const repeat = search.length > 0 && [...search].every(character => character === letter);
    search = now - lastSearch > 750 || repeat ? letter : search + letter;
    lastSearch = now;
    function findMatch(prefix: string) {
      const start = prefix.length === 1 && open ? activeIndex + 1 : 0;
      for (let offset = 0; offset < options.length; offset++) {
        const index = (start + offset) % options.length;
        if (options[index].dataset.currencyOption!.toLowerCase().startsWith(prefix)) return index;
      }
      return -1;
    }
    let nextMatch = findMatch(search);
    if (nextMatch < 0) {
      search = letter;
      nextMatch = findMatch(search);
    }
    if (nextMatch >= 0) { event.preventDefault(); show(nextMatch); }
  }

  const dismissOutside = (event: Event) => {
    if (!wrapper.contains(event.target as Node | null)) close();
  };
  if (back) listen(back, 'click', () => close(true));
  listen(trigger, 'click', () => { if (open) close(); else show(); });
  listen(wrapper, 'keydown', onKeyDown as EventListener);
  for (const option of options) listen(option, 'click', () => choose(option));
  listen(select, 'change', sync);
  listen(root, 'pricestyletoggle', () => { if (root.hasAttribute('data-price-style-open')) close(); });
  listen(root, 'videouidismiss', () => close());
  listen(document, 'pointerdown', dismissOutside);
  listen(document, 'focusin', dismissOutside);
  list.hidden = true;
  if (panel) panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  options.forEach(option => { option.tabIndex = -1; });
  root.removeAttribute('data-currency-open');
  sync();

  return {
    close,
    destroy() {
      if (destroyed) return;
      close();
      destroyed = true;
      for (const remove of removeListeners) remove();
    },
  };
}
