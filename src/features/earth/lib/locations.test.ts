import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPITALS, COUNTRIES, filterCountries, localizedCountries } from './locations';
import { DEFAULT_CENTER } from '../map/geo';

afterEach(() => vi.unstubAllGlobals());

describe('bundled country capitals', () => {
  it('covers all 193 UN members, both observer states, Kosovo and Taiwan', () => {
    expect(new Set(CAPITALS.map((capital) => capital.countryCode)).size).toBe(197);
    for (const code of ['VAT', 'PSE', 'UNK', 'TWN', 'NRU', 'PLW', 'SSD']) {
      expect(CAPITALS.some((capital) => capital.countryCode === code)).toBe(true);
    }
  });

  it('starts in New York without adding it as a country destination', () => {
    expect(DEFAULT_CENTER).toEqual([-74.006, 40.7128]);
    expect(COUNTRIES.some((capital) => capital.name === 'New York')).toBe(false);
    expect(filterCountries('United States')[0].name).toBe('Washington, D.C.');
  });

  it('uses valid, unique city coordinates in longitude-latitude order', () => {
    expect(new Set(CAPITALS.map((capital) => capital.id)).size).toBe(CAPITALS.length);
    for (const capital of CAPITALS) {
      expect(capital.name.trim()).not.toBe('');
      expect(capital.country.trim()).not.toBe('');
      expect(capital.center).toHaveLength(2);
      expect(Number.isFinite(capital.center[0])).toBe(true);
      expect(Number.isFinite(capital.center[1])).toBe(true);
      expect(Math.abs(capital.center[0])).toBeLessThanOrEqual(180);
      expect(Math.abs(capital.center[1])).toBeLessThanOrEqual(90);
    }
    const london = filterCountries('United Kingdom')[0];
    expect(london.center[0]).toBeCloseTo(-0.1187, 3);
    expect(london.center[1]).toBeCloseTo(51.5019, 3);
  });

  it('includes multiple capitals and reviewed changes rather than superseded names', () => {
    expect(CAPITALS.filter((capital) => capital.country === 'South Africa').map((capital) => capital.name))
      .toEqual(expect.arrayContaining(['Bloemfontein', 'Cape Town', 'Pretoria']));
    for (const [country, city] of [
      ['Burundi', 'Gitega'], ['Tanzania', 'Dodoma'], ['Palau', 'Ngerulmud'],
      ['Kazakhstan', 'Astana'], ['Equatorial Guinea', 'Ciudad de la Paz'],
      ['Sri Lanka', 'Sri Jayawardenepura Kotte'],
    ]) {
      expect(CAPITALS.some((capital) => capital.country === country && capital.name === city)).toBe(true);
    }
    expect(CAPITALS.some((capital) => capital.name === 'Malabo')).toBe(false);
  });

  it('offers each country once in alphabetical order with a valid destination', () => {
    expect(COUNTRIES).toHaveLength(197);
    expect(new Set(COUNTRIES.map((country) => country.countryCode)).size).toBe(COUNTRIES.length);
    expect(COUNTRIES[0].country).toBe('Afghanistan');
    expect(COUNTRIES.at(-1)?.country).toBe('Zimbabwe');
    expect(filterCountries('south').map((capital) => capital.country)).toEqual([
      'South Africa', 'South Korea', 'South Sudan',
    ]);
    expect(filterCountries('South Africa')[0].name).toBe('Pretoria');
    expect(filterCountries('Sri Lanka')[0].name).toBe('Sri Jayawardenepura Kotte');
    expect(COUNTRIES.every((country) => CAPITALS.includes(country))).toBe(true);
  });

  it('filters countries locally, ignoring case and accents without accepting city names', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(filterCountries('  ')).toBe(COUNTRIES);
    expect(filterCountries(' SAO TOME ')[0].country).toBe('São Tomé and Príncipe');
    expect(filterCountries('bRAZil')[0].country).toBe('Brazil');
    expect(filterCountries('canada')[0].name).toBe('Ottawa');
    expect(filterCountries('Paris')).toEqual([]);
    expect(filterCountries('10 Example Street')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('localized country selection', () => {
  it('keeps all destinations while translating and sorting country names for every supported language', () => {
    for (const lang of ['es', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'vi', 'ja']) {
      const countries = localizedCountries(lang);
      const collator = new Intl.Collator(lang, { sensitivity: 'base' });
      expect(countries).toHaveLength(197);
      expect(countries.every((country, index) => index === 0 || collator.compare(countries[index - 1].country, country.country) <= 0)).toBe(true);
      for (const country of countries) {
        const original = COUNTRIES.find((item) => item.id === country.id)!;
        expect(country.center).toEqual(original.center);
        expect(country.country).not.toBe(country.countryCode);
        expect(country.country).not.toMatch(/^[A-Z]{2}$/);
      }
      expect(countries.find((country) => country.countryCode === 'DEU')?.country).not.toBe('Germany');
    }
  });

  it('finds translated names, accents and Turkish dotted I without external lookups', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const [lang, query, code] of [
      ['es', 'ALEMANIA', 'DEU'], ['pt-BR', 'japao', 'JPN'], ['fr', 'etats unis', 'USA'],
      ['de', 'osterreich', 'AUT'], ['it', 'germania', 'DEU'], ['ru', 'япония', 'JPN'],
      ['tr', 'ispanya', 'ESP'], ['tr', 'İSPANYA', 'ESP'], ['vi', 'nhat ban', 'JPN'], ['ja', '日本', 'JPN'],
    ]) {
      expect(filterCountries(query, localizedCountries(lang), lang)[0]?.countryCode).toBe(code);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
