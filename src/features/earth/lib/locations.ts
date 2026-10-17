import catalogue from './capitals.json';

export interface Location {
  name: string;
  center: [number, number];
}

export interface Capital extends Location {
  id: string;
  country: string;
  countryCode: string;
}

// Bundled, reviewed data; filtering never contacts a geocoder. See README sources.
const alphabetical = new Intl.Collator('en', { sensitivity: 'base' });
export const CAPITALS: readonly Capital[] = catalogue.map((capital): Capital => ({
  ...capital,
  center: [capital.center[0], capital.center[1]],
})).sort((a, b) => alphabetical.compare(a.country, b.country) || alphabetical.compare(a.name, b.name));
// Use one capital as each country's map destination; other capitals remain in
// the source catalogue for review, but do not create duplicate country choices.
const primaryCapitals: Record<string, string> = {
  BOL: 'Sucre',
  LKA: 'Sri Jayawardenepura Kotte',
  SWZ: 'Mbabane',
  ZAF: 'Pretoria',
};
export const COUNTRIES: readonly Capital[] = Array.from(
  new Set(CAPITALS.map((capital) => capital.countryCode)),
  (code) => CAPITALS.find((capital) => capital.countryCode === code
    && (!primaryCapitals[code] || capital.name === primaryCapitals[code]))!,
);

const normalize = (text: string) => text.normalize('NFD')
  .replace(/\p{M}/gu, '').toLocaleLowerCase('en').trim();
const searchable = COUNTRIES.map((capital) => ({
  capital,
  country: normalize(capital.country),
}));

export function filterCountries(query: string): readonly Capital[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return COUNTRIES;
  return searchable
    .filter(({ country }) => words.every((word) => country.includes(word)))
    .map(({ capital }) => capital);
}
