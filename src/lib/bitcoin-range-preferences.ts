import { rangeSlots, type BitcoinRange, type RangeUnit } from './bitcoin-range';

const storageKey = 'bitcoin-tracker-ranges';

export interface RangePreferences {
  counts: Record<RangeUnit, number>;
  selected: BitcoinRange['unit'];
}

export function readRangePreferences(): RangePreferences {
  const preferences: RangePreferences = {
    counts: Object.fromEntries(rangeSlots.map(({ unit, initial }) => [unit, initial])) as Record<RangeUnit, number>,
    selected: 'all',
  };
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return preferences;
    const { counts, selected } = saved as { counts?: unknown; selected?: unknown };
    if (counts && typeof counts === 'object' && !Array.isArray(counts)) {
      for (const { unit, max } of rangeSlots) {
        const count = (counts as Record<string, unknown>)[unit];
        if (typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= max) {
          preferences.counts[unit] = count;
        }
      }
    }
    if (selected === 'all' || rangeSlots.some(({ unit }) => unit === selected)) {
      preferences.selected = selected as BitcoinRange['unit'];
    }
  } catch { /* Use defaults when storage is blocked or malformed. */ }
  return preferences;
}

export function saveRangePreferences(preferences: RangePreferences) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch { /* Keep range controls usable when storage is unavailable. */ }
}
