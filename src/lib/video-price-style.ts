const STORAGE_KEY = 'obt-video-price-style';
const DEFAULTS = { version: 1, colour: '#ffffff', font: 'modern' };
const FONTS: Record<string, string> = {
  modern: 'var(--font-sans)',
  condensed: '"Barlow Condensed", var(--font-sans)',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace',
};
const isColour = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const isFont = (value: unknown): value is string => typeof value === 'string' && Object.hasOwn(FONTS, value);

/** A small disclosure for locally saved price styling, independent of its layout. */
export function createVideoPriceStyle(root: HTMLElement, refreshLayout: () => void) {
  const wrapper = root.querySelector<HTMLElement>('[data-price-style]')!;
  const trigger = wrapper.querySelector<HTMLButtonElement>('[data-price-style-trigger]')!;
  const panel = wrapper.querySelector<HTMLElement>('[data-price-style-panel]')!;
  const colour = wrapper.querySelector<HTMLInputElement>('[data-price-colour]')!;
  const font = wrapper.querySelector<HTMLSelectElement>('[data-price-font]')!;
  const reset = wrapper.querySelector<HTMLButtonElement>('[data-reset-price-style]')!;
  const swatches = [...wrapper.querySelectorAll<HTMLButtonElement>('[data-price-swatch]')];
  const removeListeners: (() => void)[] = [];
  let state = { ...DEFAULTS };
  let open = false;
  let destroyed = false;

  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved?.version === 1) {
      if (isColour(saved.colour)) state.colour = saved.colour.toLowerCase();
      if (isFont(saved.font)) state.font = saved.font;
    }
  } catch { /* Styling remains available when browser storage is blocked or malformed. */ }

  function listen(target: EventTarget, type: string, listener: EventListener) {
    target.addEventListener(type, listener);
    removeListeners.push(() => target.removeEventListener(type, listener));
  }

  function paint() {
    root.style.setProperty('--video-price-colour', state.colour);
    root.style.setProperty('--video-price-font', FONTS[state.font]);
    colour.value = state.colour;
    font.value = state.font;
    for (const swatch of swatches) swatch.setAttribute('aria-pressed', String(swatch.dataset.priceSwatch === state.colour));
    reset.disabled = state.colour === DEFAULTS.colour && state.font === DEFAULTS.font;
    refreshLayout();
  }

  function save() {
    paint();
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { /* Preview and controls keep working when storage is blocked or full. */ }
  }

  function close(restoreFocus = false) {
    if (!open) return;
    open = false;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    root.removeAttribute('data-price-style-open');
    root.dispatchEvent(new Event('pricestyletoggle'));
    if (restoreFocus) trigger.focus();
  }

  listen(trigger, 'click', () => {
    if (open) { close(); return; }
    open = true;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    root.setAttribute('data-price-style-open', '');
    root.dispatchEvent(new Event('pricestyletoggle'));
  });
  listen(wrapper, 'keydown', ((event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); close(true); }
  }) as EventListener);
  const dismissOutside = (event: Event) => {
    if (!wrapper.contains(event.target as Node | null)) close();
  };
  listen(document, 'pointerdown', dismissOutside);
  listen(document, 'focusin', dismissOutside);
  listen(root, 'currencytoggle', () => { if (root.hasAttribute('data-currency-open')) close(); });
  listen(colour, 'input', () => {
    if (!isColour(colour.value)) return;
    state.colour = colour.value.toLowerCase();
    save();
  });
  for (const swatch of swatches) listen(swatch, 'click', () => {
    if (!isColour(swatch.dataset.priceSwatch)) return;
    state.colour = swatch.dataset.priceSwatch.toLowerCase();
    save();
  });
  listen(font, 'change', () => {
    if (!isFont(font.value)) return;
    state.font = font.value;
    save();
  });
  listen(reset, 'click', () => {
    state = { ...DEFAULTS };
    save();
    // Reset becomes disabled, so return keyboard focus to an active control.
    font.focus();
  });
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.disabled = colour.disabled = font.disabled = false;
  for (const swatch of swatches) swatch.disabled = false;
  paint();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      close();
      for (const remove of removeListeners) remove();
    },
  };
}
