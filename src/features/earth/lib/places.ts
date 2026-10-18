import { CAPITALS, localizedCountries } from './locations';
import regions from './country-regions.json';
import type { Location } from './locations';

export interface Place extends Location {
  id: string;
  kind: 'country' | 'city';
  country: string;
  countryCode: string;
  admin: string;
  population: number;
  aliases: string[];
}
export interface CityRecord {
  id: string;
  name: string;
  countryCode: string;
  region: string;
  country: string;
  admin: string;
  center: [number, number];
  population: number;
  names: Record<string, string>;
  aliases: string[];
}
interface IndexedPlace {
  place: Place;
  names: string[];
  search: string;
}
export interface PlaceIndex {
  entries: IndexedPlace[];
  countries: Place[];
  collator: Intl.Collator;
  lang: string;
}

export const PLACE_RESULT_LIMIT = 40;
const normalize = (text: string, lang: string) => text.toLocaleLowerCase(lang).normalize('NFD')
  .replace(/\p{M}/gu, '').replace(/ı/g, 'i').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Load the same public file for every search, never a request containing the query.
let cityPromise: Promise<CityRecord[]> | undefined;
export function loadCities(): Promise<CityRecord[]> {
  cityPromise ??= import('./cities.json').then((module) => module.default as unknown as CityRecord[])
    .catch((error: unknown) => { cityPromise = undefined; throw error; });
  return cityPromise;
}

export function createPlaceIndex(lang: string, cities: readonly CityRecord[] = []): PlaceIndex {
  const countryNames = new Intl.DisplayNames([lang], { type: 'region' });
  const language = lang.split('-')[0];
  const countries: Place[] = localizedCountries(lang).map((capital) => ({
    ...capital, kind: 'country', admin: '', population: 0,
    aliases: [CAPITALS.find((item) => item.id === capital.id)!.country,
      regions[capital.countryCode as keyof typeof regions]],
  }));
  const represented = new Set<string>();
  const capitalsByCountry = new Map<string, (typeof CAPITALS)[number][]>();
  for (const capital of CAPITALS) {
    const group = capitalsByCountry.get(capital.countryCode) ?? [];
    group.push(capital);
    capitalsByCountry.set(capital.countryCode, group);
  }
  const cityPlaces: Place[] = cities.map((city) => {
    // Preserve reviewed capitals when an upstream city snapshot has an older name or coordinate.
    const candidates = capitalsByCountry.get(city.countryCode) ?? [];
    const sourceNames = [city.name, ...city.aliases, ...Object.values(city.names)].map((name) => normalize(name, 'en'));
    const capital = candidates.find((item) => sourceNames.includes(normalize(item.name, 'en')))
      ?? candidates.find((item) => Math.hypot((item.center[0] - city.center[0]) * Math.cos(city.center[1] * Math.PI / 180), item.center[1] - city.center[1]) < 0.04);
    if (capital) represented.add(capital.id);
    const currentNames = city.id === 'ne-1159150965'
      ? { ru: 'Астана', ja: 'アスタナ' } as Record<string, string> : {};
    return {
      id: city.id, kind: 'city', name: currentNames[language] || (city.id === 'ne-1159150965' ? 'Astana'
        : language === 'en' ? capital?.name || city.name : city.names[language] || capital?.name || city.name),
      country: countryNames.of(city.region) || city.country, countryCode: city.countryCode,
      admin: city.admin, center: capital?.center ?? city.center, population: city.population,
      aliases: [city.name, city.country, city.region, ...Object.values(city.names), ...city.aliases, ...(capital ? [capital.name] : [])],
    };
  });
  // Include newly established capitals absent from the upstream city release.
  if (cities.length) {
    for (const capital of CAPITALS) {
      if (represented.has(capital.id)) continue;
      cityPlaces.push({
        ...capital, id: `city-${capital.id}`, kind: 'city', admin: '', population: 0,
        country: countryNames.of(regions[capital.countryCode as keyof typeof regions]) || capital.country,
        aliases: [capital.country],
      });
    }
  }
  const entries = [...countries, ...cityPlaces].map((place) => ({
    place,
    names: [place.kind === 'country' ? place.country : place.name, ...place.aliases.slice(0, 1)]
      .map((name) => normalize(name, lang)),
    search: normalize([place.kind === 'city' ? place.name : '', place.country, place.countryCode, place.admin, ...place.aliases].join(' '), lang),
  }));
  return { entries, countries, collator: new Intl.Collator(lang, { sensitivity: 'base' }), lang };
}

export function searchPlaces(query: string, index: PlaceIndex): Place[] {
  const normalized = normalize(query, index.lang);
  if (!normalized) return index.countries;
  const words = normalized.split(' ');
  return index.entries.flatMap((entry) => {
    if (!words.every((word) => entry.search.includes(word))) return [];
    const score = entry.names.some((name) => name === normalized) ? 0
      : entry.names.some((name) => name.startsWith(normalized)) ? 1 : 2;
    return [{ entry, score }];
  }).sort((a, b) => a.score - b.score
    || (a.entry.place.kind === b.entry.place.kind ? 0 : a.entry.place.kind === 'country' ? -1 : 1)
    || b.entry.place.population - a.entry.place.population
    || index.collator.compare(placeLabel(a.entry.place), placeLabel(b.entry.place)))
    .slice(0, PLACE_RESULT_LIMIT).map(({ entry }) => entry.place);
}

export function placeLabel(place: Place): string {
  return place.kind === 'country' ? place.country : `${place.name}, ${place.country}`;
}
