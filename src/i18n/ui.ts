import { en } from './locales/en';
import { es } from './locales/es';
import { ptBR } from './locales/pt-BR';
import { ru } from './locales/ru';
import { tr } from './locales/tr';
import { vi } from './locales/vi';
import { ja } from './locales/ja';
import { fr } from './locales/fr';
import { de } from './locales/de';
import { it } from './locales/it';

// Preserve the English keys while allowing translated strings and either
// mutable locale arrays or the canonical dictionary's readonly arrays.
type DictionaryShape<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly DictionaryShape<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DictionaryShape<T[K]> }
      : T;

export type Dict = DictionaryShape<typeof en>;

export const defaultLang = 'en';

// Keyed by BCP-47 code so the keys line up with what Astro.currentLocale
// returns (the first entry of a locale's `codes`, e.g. 'pt-BR' for the /pt/
// route). resolveLang() in utils.ts maps an arbitrary currentLocale back here.
export const ui = {
  en,
  es,
  'pt-BR': ptBR,
  ru,
  tr,
  vi,
  ja,
  fr,
  de,
  it,
} satisfies Record<string, Dict>;

export type Lang = keyof typeof ui;
