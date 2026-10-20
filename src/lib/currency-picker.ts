interface OptionPickerConfig {
  wrapper?: HTMLElement;
  panel?: HTMLElement;
  back?: HTMLButtonElement;
  closeOnSelect?: boolean;
  selectors?: { trigger: string; value: string; list: string; option: string; optionKey: string };
  displayOptionLabel?: boolean;
  openAttribute?: string;
  toggleEvent?: string;
}

/** A keyboard-accessible option menu backed by a select; defaults match currency menus. */
export function createOptionPicker(root: HTMLElement, select: HTMLSelectElement, {
  wrapper = root.querySelector<HTMLElement>('[data-currency-picker]')!, panel, back, closeOnSelect = true,
  selectors = { trigger: '[data-currency-trigger]', value: '[data-currency-value]', list: '[data-currency-list]', option: '[data-currency-option]', optionKey: 'currencyOption' },
  displayOptionLabel = false, openAttribute = 'data-currency-open', toggleEvent = 'currencytoggle',
}: OptionPickerConfig = {}) {
  const trigger = wrapper.querySelector<HTMLButtonElement>(selectors.trigger)!;
  const value = wrapper.querySelector<HTMLElement>(selectors.value)!;
  const list = wrapper.querySelector<HTMLElement>(selectors.list)!;
  const options = [...list.querySelectorAll<HTMLButtonElement>(selectors.option)];
  const optionValue = (option: HTMLButtonElement) => option.dataset[selectors.optionKey]!;
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
    root.removeAttribute(openAttribute);
    root.dispatchEvent(new Event(toggleEvent));
    if (restoreFocus && !trigger.disabled) trigger.focus();
  }

  function show(index?: number) {
    if (destroyed || trigger.disabled || !options.length) return;
    if (!open) {
      open = true;
      list.hidden = false;
      if (panel) panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      root.setAttribute(openAttribute, '');
      root.dispatchEvent(new Event(toggleEvent));
    }
    const selected = options.findIndex(option => optionValue(option) === select.value);
    focusOption(index ?? (selected < 0 ? 0 : selected));
  }

  function sync() {
    const selected = options.find(option => optionValue(option) === select.value);
    value.textContent = displayOptionLabel ? selected?.textContent?.trim() ?? select.value : select.value;
    trigger.disabled = select.disabled;
    options.forEach(option => option.setAttribute('aria-selected', String(optionValue(option) === select.value)));
    if (trigger.disabled) close();
  }

  function choose(option: HTMLButtonElement) {
    if (destroyed || select.disabled || option.disabled) return;
    select.value = optionValue(option);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (closeOnSelect) close(true);
    else focusOption(options.indexOf(option));
  }

  function onKeyDown(event: KeyboardEvent) {
    if (destroyed || trigger.disabled) return;
    const fromTrigger = event.target === trigger;
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); event.stopPropagation(); close(true); }
      return;
    }
    // A standalone panel can share its wrapper with other settings.
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
        next = options.findIndex(option => optionValue(option) === select.value);
        if (next < 0) next = event.key === 'ArrowUp' ? options.length - 1 : 0;
      } else next = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    }
    if (next !== undefined) {
      event.preventDefault();
      search = '';
      show(next);
      return;
    }
    // Printable keys only move focus; activation commits the selected option.
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
        if (optionValue(options[index]).toLowerCase().startsWith(prefix)) return index;
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
  listen(document, 'pointerdown', dismissOutside);
  listen(document, 'focusin', dismissOutside);
  list.hidden = true;
  if (panel) panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  options.forEach(option => { option.tabIndex = -1; });
  root.removeAttribute(openAttribute);
  sync();

  return {
    close,
    sync,
    destroy() {
      if (destroyed) return;
      close();
      destroyed = true;
      for (const remove of removeListeners) remove();
    },
  };
}

export const createCurrencyPicker = createOptionPicker;
