const STORAGE_KEY = 'obt-video-price-style';
const DEFAULTS = { version: 1, colour: '#ffffff', font: 'modern', stroke: false, strokeWidth: 1, strokeColour: '#000000' };
export type VideoPriceStyleState = Omit<typeof DEFAULTS, 'version'>;
const FONTS: Record<string, string> = {
  modern: 'var(--font-sans)',
  condensed: '"Barlow Condensed", var(--font-sans)',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace',
  digital: '"OBT Digital", var(--font-sans)',
  space: '"Space Grotesk", var(--font-sans)',
  slab: '"Roboto Slab", Georgia, serif',
  bungee: '"Bungee", var(--font-sans)',
};
export const isColour = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export const isFont = (value: unknown): value is string => typeof value === 'string' && Object.hasOwn(FONTS, value);

/** A small disclosure for locally saved price styling, independent of its layout. */
export function createVideoPriceStyle(root: HTMLElement, refreshLayout: () => void, initial?: VideoPriceStyleState) {
  const wrapper = root.querySelector<HTMLElement>('[data-price-style]')!;
  const settingsTrigger = wrapper.querySelector<HTMLButtonElement>('[data-price-settings-trigger]')!;
  const trigger = wrapper.querySelector<HTMLButtonElement>('[data-price-style-trigger]')!;
  const menu = wrapper.querySelector<HTMLElement>('[data-price-settings-panel]')!;
  const panel = wrapper.querySelector<HTMLElement>('[data-price-style-panel]')!;
  const colour = wrapper.querySelector<HTMLInputElement>('[data-price-colour]')!;
  const font = wrapper.querySelector<HTMLSelectElement>('[data-price-font]')!;
  const position = root.querySelector<HTMLElement>('[data-price-position]')!;
  const stroke = wrapper.querySelector<HTMLInputElement>('[data-price-stroke]')!;
  const strokeWidth = wrapper.querySelector<HTMLInputElement>('[data-price-stroke-width]')!;
  const strokeColour = wrapper.querySelector<HTMLInputElement>('[data-price-stroke-colour]')!;
  const strokeOptions = wrapper.querySelector<HTMLElement>('[data-stroke-options]')!;
  const strokeValue = wrapper.querySelector<HTMLOutputElement>('[data-stroke-width-value]')!;
  const swatches = [...wrapper.querySelectorAll<HTMLButtonElement>('[data-price-swatch]')];
  const removeListeners: (() => void)[] = [];
  let state = { ...DEFAULTS };
  let open = false;
  let settingsOpen = false;
  let destroyed = false;
  let dismissingPointerClick = false;

  try {
    const saved = initial ? { ...initial, version: 1 } : JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved?.version === 1) {
      if (isColour(saved.colour)) state.colour = saved.colour.toLowerCase();
      if (isFont(saved.font)) state.font = saved.font;
      state.stroke = saved.stroke === true;
      if (typeof saved.strokeWidth === 'number' && Number.isFinite(saved.strokeWidth) && saved.strokeWidth >= .5 && saved.strokeWidth <= 6) state.strokeWidth = Math.round(saved.strokeWidth * 2) / 2;
      if (isColour(saved.strokeColour)) state.strokeColour = saved.strokeColour.toLowerCase();
    }
  } catch { /* Styling remains available when browser storage is blocked or malformed. */ }

  function listen(target: EventTarget, type: string, listener: EventListener, capture = false) {
    target.addEventListener(type, listener, capture);
    removeListeners.push(() => target.removeEventListener(type, listener, capture));
  }

  function paint() {
    root.style.setProperty('--video-price-colour', state.colour);
    root.style.setProperty('--video-price-font', FONTS[state.font]);
    root.style.setProperty('--video-price-weight', state.font === 'digital' || state.font === 'bungee' ? '400'
      : state.font === 'space' || state.font === 'slab' ? '700' : '750');
    root.style.setProperty('--video-price-spacing', state.font === 'digital' ? '.04em'
      : state.font === 'bungee' ? '0' : state.font === 'space' || state.font === 'slab' ? '-.03em' : '-.065em');
    root.style.setProperty('--video-price-padding', state.font === 'digital' ? '.1em' : '0');
    root.style.setProperty('--video-price-stroke-width', state.stroke ? `${state.strokeWidth}px` : '0px');
    root.style.setProperty('--video-price-stroke-colour', state.strokeColour);
    colour.value = state.colour;
    font.value = state.font;
    stroke.checked = state.stroke;
    strokeWidth.value = String(state.strokeWidth);
    strokeWidth.setAttribute('aria-valuetext', `${state.strokeWidth} px`);
    strokeValue.value = `${state.strokeWidth} px`;
    strokeColour.value = state.strokeColour;
    strokeOptions.hidden = !state.stroke;
    strokeWidth.disabled = strokeColour.disabled = !state.stroke;
    for (const swatch of swatches) swatch.setAttribute('aria-pressed', String(swatch.dataset.priceSwatch === state.colour));
    const isDefault = state.colour === DEFAULTS.colour && state.font === DEFAULTS.font && !state.stroke
      && state.strokeWidth === DEFAULTS.strokeWidth && state.strokeColour === DEFAULTS.strokeColour;
    root.toggleAttribute('data-price-style-custom', !isDefault);
    refreshLayout();
    anchor();
  }

  function anchor() {
    if (destroyed) return;
    const box = position.getBoundingClientRect();
    const gap = 10, padding = 16;
    const clamp = (value: number, maximum: number) => Math.max(padding, Math.min(value, maximum));
    const centre = box.left + box.width / 2;
    menu.style.setProperty('max-height', `${Math.max(0, window.innerHeight - padding * 2)}px`);
    const surface = settingsOpen ? menu : settingsTrigger;
    const panelHeight = surface.offsetHeight, panelWidth = surface.offsetWidth;
    const panelOnLeft = centre > window.innerWidth / 2 || box.right + gap + panelWidth > window.innerWidth - padding;
    const beside = box.left - gap - panelWidth >= padding || box.right + gap + panelWidth <= window.innerWidth - padding;
    const panelLeft = beside ? (panelOnLeft ? box.left - gap - panelWidth : box.right + gap) : centre - panelWidth / 2;
    const panelTop = beside ? box.top : box.bottom + gap + panelHeight <= window.innerHeight - padding
      ? box.bottom + gap : box.top - gap - panelHeight;
    const top = clamp(panelTop, window.innerHeight - panelHeight - padding);
    const left = clamp(panelLeft, window.innerWidth - panelWidth - padding);
    wrapper.style.setProperty('top', `${top}px`);
    wrapper.style.setProperty('left', `${left}px`);
  }

  function save() {
    paint();
    root.dispatchEvent(new Event('pricestylechange'));
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
    anchor();
    if (restoreFocus) trigger.focus();
  }

  function closeSettings(restoreFocus = false) {
    if (!settingsOpen) return;
    settingsOpen = false;
    close();
    menu.hidden = true;
    settingsTrigger.hidden = false;
    settingsTrigger.setAttribute('aria-expanded', 'false');
    root.removeAttribute('data-price-settings-open');
    root.dispatchEvent(new Event('pricesettingstoggle'));
    anchor();
    if (restoreFocus) settingsTrigger.focus();
  }

  listen(settingsTrigger, 'click', () => {
    settingsOpen = true;
    menu.hidden = false;
    settingsTrigger.hidden = true;
    settingsTrigger.setAttribute('aria-expanded', 'true');
    root.setAttribute('data-price-settings-open', '');
    root.dispatchEvent(new Event('pricesettingstoggle'));
    anchor();
    trigger.focus();
  });
  listen(trigger, 'click', () => {
    if (open) { close(); return; }
    open = true;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    root.setAttribute('data-price-style-open', '');
    root.dispatchEvent(new Event('pricestyletoggle'));
    anchor();
  });
  listen(wrapper, 'keydown', ((event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (open) { event.preventDefault(); close(true); }
    else if (settingsOpen) { event.preventDefault(); closeSettings(true); }
  }) as EventListener);
  const dismissOutside = (event: Event) => {
    if (!wrapper.contains(event.target as Node | null)) closeSettings();
  };
  listen(document, 'pointerdown', event => {
    dismissingPointerClick = settingsOpen && !wrapper.contains(event.target as Node | null);
    if (dismissingPointerClick) {
      // Prevent the same gesture from starting a price drag or activating a control.
      event.preventDefault();
      event.stopPropagation();
      closeSettings();
      root.dispatchEvent(new Event('videouidismiss'));
    }
  }, true);
  // Consume the dismissal click before playback or other controls can handle it.
  listen(document, 'click', event => {
    const outside = settingsOpen && !wrapper.contains(event.target as Node | null);
    if (!dismissingPointerClick && !outside) return;
    if (outside) {
      closeSettings();
      root.dispatchEvent(new Event('videouidismiss'));
    }
    dismissingPointerClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  listen(document, 'focusin', dismissOutside);
  listen(document, 'focusin', anchor);
  listen(root, 'currencytoggle', () => { if (root.hasAttribute('data-currency-open')) close(); });
  listen(root, 'videouidismiss', () => closeSettings());
  listen(root, 'currencytoggle', anchor);
  listen(root, 'pricelayoutchange', anchor);
  listen(root, 'priceeditortoggle', anchor);
  listen(window, 'resize', anchor);
  listen(window, 'pointermove', () => { if (root.hasAttribute('data-price-layout-open')) anchor(); });
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
  listen(stroke, 'change', () => { state.stroke = stroke.checked; save(); });
  listen(strokeWidth, 'input', () => {
    const value = Number(strokeWidth.value);
    if (!Number.isFinite(value) || value < .5 || value > 6) return;
    state.strokeWidth = Math.round(value * 2) / 2;
    save();
  });
  listen(strokeColour, 'input', () => {
    if (!isColour(strokeColour.value)) return;
    state.strokeColour = strokeColour.value.toLowerCase();
    save();
  });
  listen(root, 'pricerestore', () => {
    state = { ...DEFAULTS };
    save();
  });
  menu.hidden = true;
  settingsTrigger.disabled = false;
  settingsTrigger.setAttribute('aria-expanded', 'false');
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.disabled = colour.disabled = font.disabled = stroke.disabled = false;
  for (const swatch of swatches) swatch.disabled = false;
  paint();
  let observer: ResizeObserver | undefined;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(anchor);
    observer.observe(wrapper);
    observer.observe(position);
    observer.observe(menu);
  }

  return {
    getState(): VideoPriceStyleState {
      const { version, ...style } = state;
      return style;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      closeSettings();
      observer?.disconnect();
      for (const remove of removeListeners) remove();
      root.removeAttribute('data-price-style-custom');
    },
  };
}
