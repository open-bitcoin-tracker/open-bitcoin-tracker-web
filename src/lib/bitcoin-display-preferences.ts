import type { ChartScale } from './bitcoin-chart';
import { isCurrency, type Currency } from './bitcoin-currency';

const key = 'bitcoin-tracker-display';
const currencyChange = 'bitcoin-currency-change';
let unsavedCurrency: Currency | undefined;
export interface DisplayPreferences { scale: ChartScale; currency: Currency }

export function readDisplayPreferences(): DisplayPreferences {
  const preferences: DisplayPreferences = { scale: 'logarithmic', currency: 'USD' };
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    if (saved?.scale === 'linear' || saved?.scale === 'logarithmic') preferences.scale = saved.scale;
    if (isCurrency(saved?.currency)) preferences.currency = saved.currency;
  } catch { /* Keep the default display usable without storage. */ }
  if (unsavedCurrency) preferences.currency = unsavedCurrency;
  return preferences;
}

export function saveDisplayPreferences(preferences: DisplayPreferences) {
  unsavedCurrency = preferences.currency;
  try {
    window.localStorage.setItem(key, JSON.stringify(preferences));
    unsavedCurrency = undefined;
  }
  catch { /* Keep settings usable when storage is blocked or full. */ }
  window.dispatchEvent(new Event(currencyChange));
}

/** Keep all price displays in sync, including other tabs and restored pages. */
export function subscribeCurrencyPreference(onChange: (currency: Currency) => void) {
  let currency = readDisplayPreferences().currency;
  const sync = () => {
    const next = readDisplayPreferences().currency;
    if (next === currency) return;
    currency = next;
    onChange(next);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    unsavedCurrency = undefined;
    sync();
  };
  const onVisibility = () => { if (!document.hidden) sync(); };
  window.addEventListener(currencyChange, sync);
  window.addEventListener('storage', onStorage);
  window.addEventListener('pageshow', sync);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener(currencyChange, sync);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', sync);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
