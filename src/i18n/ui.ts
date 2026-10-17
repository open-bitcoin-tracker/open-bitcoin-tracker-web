import type { Lang } from './languages.ts';
import { en } from './locales/en.ts';
import { es } from './locales/es.ts';
import { ptBR } from './locales/pt-BR.ts';
import { ru } from './locales/ru.ts';
import { tr } from './locales/tr.ts';
import { vi } from './locales/vi.ts';
import { ja } from './locales/ja.ts';
import { fr } from './locales/fr.ts';
import { de } from './locales/de.ts';
import { it } from './locales/it.ts';

export { defaultLang, type Lang } from './languages.ts';

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
} satisfies Record<Lang, Dict>;
