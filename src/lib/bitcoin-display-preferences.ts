import type { ChartScale } from './bitcoin-chart';
import { isCurrency, type Currency } from './bitcoin-currency';

const key = 'bitcoin-tracker-display';
export interface DisplayPreferences { scale: ChartScale; currency: Currency }

export function readDisplayPreferences(): DisplayPreferences {
  const preferences: DisplayPreferences = { scale: 'logarithmic', currency: 'USD' };
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    if (saved?.scale === 'linear' || saved?.scale === 'logarithmic') preferences.scale = saved.scale;
    if (isCurrency(saved?.currency)) preferences.currency = saved.currency;
  } catch { /* Keep the default display usable without storage. */ }
  return preferences;
}

export function saveDisplayPreferences(preferences: DisplayPreferences) {
  try { window.localStorage.setItem(key, JSON.stringify(preferences)); }
  catch { /* Keep settings usable when storage is blocked or full. */ }
}
