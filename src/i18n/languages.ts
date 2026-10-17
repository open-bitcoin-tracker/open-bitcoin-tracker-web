// Shared by Astro, page routes, language links, and edge redirects. Keep this
// module free of dictionaries so redirects only load locale metadata.
export const defaultLang = 'en';

// `code` is the dictionary / BCP-47 code; `loc` is the URL path segment.
// English stays at the root. Portuguese accepts pt-BR under the short /pt/ URL.
export const languages = [
  { code: 'en', loc: 'en', label: 'English' },
  { code: 'es', loc: 'es', label: 'Español' },
  { code: 'pt-BR', loc: 'pt', label: 'Português (BR)' },
  { code: 'ru', loc: 'ru', label: 'Русский' },
  { code: 'tr', loc: 'tr', label: 'Türkçe' },
  { code: 'vi', loc: 'vi', label: 'Tiếng Việt' },
  { code: 'ja', loc: 'ja', label: '日本語' },
  { code: 'fr', loc: 'fr', label: 'Français' },
  { code: 'de', loc: 'de', label: 'Deutsch' },
  { code: 'it', loc: 'it', label: 'Italiano' },
] as const;

export type Lang = typeof languages[number]['code'];
export const localizedLanguages = languages.filter(({ code }) => code !== defaultLang);

export function getLocalizedStaticPaths() {
  return localizedLanguages.map(({ loc }) => ({ params: { lang: loc } }));
}
