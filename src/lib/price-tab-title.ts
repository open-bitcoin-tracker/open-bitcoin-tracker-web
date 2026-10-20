import { createOptionPicker } from './currency-picker';

const preferenceKey = 'bitcoin-tracker-price-tab';
const refreshPreferenceKey = 'bitcoin-tracker-price-tab-refresh';
export const priceTabRefreshSeconds = [1, 5, 15, 30, 60] as const;
const validRefresh = (value: string | null) => priceTabRefreshSeconds.find(seconds => String(seconds) === value);

/** Optional price-only tab title, enabled only after the explanation is confirmed. */
export function createPriceTabTitle(root: HTMLElement) {
  const pageTitle = document.title;
  const toggle = root.querySelector<HTMLButtonElement>('[data-price-tab-toggle]')!;
  const dialog = root.querySelector<HTMLDialogElement>('[data-price-tab-dialog]')!;
  const heading = dialog.querySelector<HTMLElement>('[data-price-tab-heading]')!;
  const confirm = dialog.querySelector<HTMLButtonElement>('[data-price-tab-confirm]')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('[data-price-tab-cancel]')!;
  const menu = root.querySelector<HTMLDetailsElement>('[data-chart-settings]')!;
  const menuTrigger = root.querySelector<HTMLElement>('[data-settings-trigger]')!;
  const refreshRow = root.querySelector<HTMLElement>('[data-price-tab-refresh-row]')!;
  const refreshSelect = root.querySelector<HTMLSelectElement>('[data-price-tab-refresh]')!;
  const dialogRefresh = dialog.querySelector<HTMLSelectElement>('[data-price-tab-dialog-refresh]')!;
  const confirmation = dialog.querySelector<HTMLElement>('[data-price-tab-confirmation]')!;
  const dialogRefreshPanel = dialog.querySelector<HTMLElement>('[data-price-tab-refresh-panel]')!;
  const dialogRefreshHeading = dialog.querySelector<HTMLElement>('[data-price-tab-refresh-heading]')!;
  const dialogDescription = dialog.getAttribute('aria-describedby');
  let enabled = false;
  let refreshSeconds: number = 1;
  let price: string | undefined;
  let destroyed = false;
  let lastPricePaint = -Infinity;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  try { enabled = window.localStorage.getItem(preferenceKey) === 'true'; }
  catch { /* Remain off by default if storage is unavailable. */ }
  try { refreshSeconds = validRefresh(window.localStorage.getItem(refreshPreferenceKey)) ?? 1; }
  catch { /* Use the default interval when storage is unavailable. */ }
  refreshSelect.value = dialogRefresh.value = String(refreshSeconds);
  const pickerOptions = {
    selectors: { trigger: '[data-refresh-trigger]', value: '[data-refresh-value]', list: '[data-refresh-list]', option: '[data-refresh-option]', optionKey: 'refreshOption' },
    displayOptionLabel: true, openAttribute: 'data-refresh-open', toggleEvent: 'refreshtoggle',
  };
  const refreshPicker = createOptionPicker(menu, refreshSelect, {
    ...pickerOptions, wrapper: menu,
    panel: menu.querySelector<HTMLElement>('[data-refresh-panel]')!,
    back: menu.querySelector<HTMLButtonElement>('[data-refresh-back]')!,
  });
  const dialogPicker = createOptionPicker(dialog, dialogRefresh, {
    ...pickerOptions, wrapper: dialog, panel: dialogRefreshPanel,
    back: dialog.querySelector<HTMLButtonElement>('[data-price-tab-refresh-back]')!,
  });

  function onDialogRefreshToggle() {
    const choosing = !dialogRefreshPanel.hidden;
    confirmation.hidden = choosing;
    dialog.setAttribute('aria-labelledby', choosing ? dialogRefreshHeading.id : heading.id);
    if (!choosing && dialogDescription) dialog.setAttribute('aria-describedby', dialogDescription);
    else dialog.removeAttribute('aria-describedby');
  }

  function clearRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }

  function paint(immediate = false) {
    const title = !destroyed && enabled && price ? price : pageTitle;
    toggle.setAttribute('aria-checked', String(enabled));
    refreshRow.hidden = !enabled;
    if (title === pageTitle) {
      clearRefresh();
      lastPricePaint = -Infinity;
      if (document.title !== title) document.title = title;
      return;
    }
    if (title === document.title) { clearRefresh(); return; }
    const remaining = refreshSeconds * 1000 - (Date.now() - lastPricePaint);
    if (immediate || remaining <= 0) {
      clearRefresh();
      document.title = title;
      lastPricePaint = Date.now();
    } else if (refreshTimer === undefined) {
      // Coalesce ticks and show the newest price once the chosen interval elapses.
      refreshTimer = setTimeout(() => { refreshTimer = undefined; paint(); }, remaining);
    }
  }

  function savePreferences() {
    try {
      window.localStorage.setItem(preferenceKey, String(enabled));
      window.localStorage.setItem(refreshPreferenceKey, String(refreshSeconds));
    } catch { /* The choice still works for this visit when storage is blocked. */ }
  }

  function setEnabled(value: boolean) {
    enabled = value;
    savePreferences();
    paint(true);
  }

  function onToggle() {
    refreshPicker.close();
    if (enabled) {
      setEnabled(false);
    } else if (!dialog.open) {
      menu.open = false;
      dialogRefresh.value = String(refreshSeconds);
      dialogPicker.sync();
      dialog.showModal();
      heading.focus({ preventScroll: true });
    }
  }

  function onConfirm() {
    if (!dialog.open || destroyed) return;
    refreshSeconds = validRefresh(dialogRefresh.value) ?? refreshSeconds;
    refreshSelect.value = String(refreshSeconds);
    refreshPicker.sync();
    setEnabled(true);
    dialog.close();
  }

  function onCancel(event: Event) {
    event.preventDefault();
    if (!dialogRefreshPanel.hidden) {
      dialogPicker.close(true);
      return;
    }
    dialog.close();
  }

  function onClose() {
    dialogPicker.close();
    if (!destroyed) menuTrigger.focus({ preventScroll: true });
  }

  function onMenuToggle() {
    if (!menu.open) refreshPicker.close();
  }

  function onRefreshChange() {
    refreshSeconds = validRefresh(refreshSelect.value) ?? refreshSeconds;
    refreshSelect.value = String(refreshSeconds);
    refreshPicker.sync();
    savePreferences();
    paint(true);
  }

  toggle.addEventListener('click', onToggle);
  confirm.addEventListener('click', onConfirm);
  cancel.addEventListener('click', onCancel);
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('close', onClose);
  dialog.addEventListener('refreshtoggle', onDialogRefreshToggle);
  refreshSelect.addEventListener('change', onRefreshChange);
  menu.addEventListener('toggle', onMenuToggle);
  onDialogRefreshToggle();
  paint();

  return {
    get enabled() { return enabled; },
    update(value?: string, immediate = false) { price = value; paint(immediate); },
    destroy() {
      destroyed = true;
      toggle.removeEventListener('click', onToggle);
      confirm.removeEventListener('click', onConfirm);
      cancel.removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      refreshSelect.removeEventListener('change', onRefreshChange);
      menu.removeEventListener('toggle', onMenuToggle);
      refreshPicker.destroy();
      dialogPicker.destroy();
      dialog.removeEventListener('refreshtoggle', onDialogRefreshToggle);
      if (dialog.open) dialog.close();
      paint();
    },
  };
}
