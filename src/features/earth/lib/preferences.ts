import type { MeasurementSystem } from './measurements';

interface Preferences {
  measurements: MeasurementSystem;
}

const storageKeys = {
  measurements: 'bitcoin-land:measurements:v1',
};

const validValues = {
  measurements: ['metric', 'imperial'],
};

export function readPreference<K extends keyof Preferences>(
  name: K,
): Preferences[K] | null {
  try {
    const value = window.localStorage.getItem(storageKeys[name]);
    return value !== null && validValues[name].includes(value)
      ? (value as Preferences[K])
      : null;
  } catch {
    // Storage may be unavailable or disabled by the browser.
    return null;
  }
}

export function savePreference<K extends keyof Preferences>(
  name: K,
  value: Preferences[K],
) {
  try {
    window.localStorage.setItem(storageKeys[name], value);
  } catch {
    // Keep the current selection usable even when it cannot be saved.
  }
}
