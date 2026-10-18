import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlaceIndex, loadCities, placeLabel, PLACE_RESULT_LIMIT, searchPlaces } from './places';
import { CAPITALS } from './locations';
import source from './cities-source.json';

const cities = await loadCities();
const english = createPlaceIndex('en', cities);
afterEach(() => vi.unstubAllGlobals());

describe('bundled local place search', () => {
  it('contains a provenance record and valid, unique city points', () => {
    expect(cities.length).toBe(source.count);
    expect(cities.length).toBeGreaterThan(7000);
    expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set(cities.map((city) => city.id)).size).toBe(cities.length);
    for (const city of cities) {
      expect(city.name.trim()).not.toBe('');
      expect(city.region).toMatch(/^[A-Z]{2}$/);
      expect(city.country.trim()).not.toBe('');
      expect(city.center.every(Number.isFinite)).toBe(true);
      expect(Math.abs(city.center[0])).toBeLessThanOrEqual(180);
      expect(Math.abs(city.center[1])).toBeLessThanOrEqual(90);
    }
  });
  it('preserves all country destinations with countries available before cities load', () => {
    const initial = createPlaceIndex('en');
    expect(searchPlaces('', initial)).toHaveLength(197);
    expect(searchPlaces('', english)).toHaveLength(197);
    expect(searchPlaces('United States', english)[0]).toMatchObject({ kind: 'country', name: 'Washington, D.C.' });
    expect(searchPlaces('Paris', initial)).toEqual([]);
  });
  it('finds cities rather than country destinations and disambiguates same-name places', () => {
    expect(searchPlaces('London', english)[0]).toMatchObject({ kind: 'city', countryCode: 'GBR' });
    expect(searchPlaces('London Canada', english)[0]).toMatchObject({ kind: 'city', countryCode: 'CAN' });
    expect(searchPlaces('Paris', english)[0]).toMatchObject({ kind: 'city', countryCode: 'FRA' });
    expect(searchPlaces('New York', english)[0]).toMatchObject({ kind: 'city', countryCode: 'USA' });
    expect(searchPlaces(' SAO PAULO ', english)[0]).toMatchObject({ kind: 'city', countryCode: 'BRA' });
    expect(placeLabel(searchPlaces('London Canada', english)[0])).toContain('Canada');
    expect(searchPlaces('Springfield', english).filter((place) => place.countryCode === 'USA').every((place) => place.admin)).toBe(true);
  });
  it('retains reviewed capital changes and newly established capitals', () => {
    for (const capital of CAPITALS) {
      expect(english.entries.some(({ place }) => place.kind === 'city'
        && place.countryCode === capital.countryCode && place.name === capital.name
        && place.center[0] === capital.center[0] && place.center[1] === capital.center[1]), capital.name).toBe(true);
    }
    for (const [name, code] of [['Astana', 'KAZ'], ['Gitega', 'BDI'], ['Ciudad de la Paz', 'GNQ'], ['Ngerulmud', 'PLW']]) {
      const place = searchPlaces(name, english).find((item) => item.kind === 'city' && item.countryCode === code)!;
      const reviewed = CAPITALS.find((capital) => capital.name === name && capital.countryCode === code)!;
      expect(place).toBeDefined();
      expect(place.name).toBe(name);
      expect(place.center).toEqual(reviewed.center);
    }
  });
  it('bounds broad results and leaves unsupported addresses unavailable without network or storage', () => {
    const fetch = vi.fn();
    const save = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('localStorage', { getItem: save, setItem: save });
    expect(searchPlaces('a', english)).toHaveLength(PLACE_RESULT_LIMIT);
    expect(searchPlaces('10 Example Street', english)).toEqual([]);
    expect(searchPlaces('zzzz-no-city', english)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('supports translated names, accents, non-Latin names and English aliases', () => {
    for (const [lang, query, code] of [
      ['es', 'Londres', 'GBR'], ['pt-BR', 'sao paulo', 'BRA'], ['fr', 'Munich', 'DEU'],
      ['de', 'Munchen', 'DEU'], ['it', 'Londra', 'GBR'], ['ru', 'Токио', 'JPN'],
      ['tr', 'İSTANBUL', 'TUR'], ['vi', 'Tokyo', 'JPN'], ['ja', '東京', 'JPN'],
    ]) {
      const index = createPlaceIndex(lang, cities);
      expect(searchPlaces(query, index)[0], `${lang}: ${query}`).toMatchObject({ kind: 'city', countryCode: code });
      expect(searchPlaces('London', index)[0]).toMatchObject({ kind: 'city', countryCode: 'GBR' });
    }
  });
});
