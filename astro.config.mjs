// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import { defaultLang, languages } from './src/i18n/languages.ts';

// English is the default and stays at the site root (no /en/ prefix); the other
// nine languages are served under a path prefix. Portuguese is the one locale
// whose URL segment (pt) differs from its BCP-47 code (pt-BR) — the `codes`
// array makes Astro.currentLocale resolve to 'pt-BR' on the /pt/ route while
// the URL stays short. Shared locale metadata lives in src/i18n/languages.ts.
// https://astro.build/config
export default defineConfig({
  site: 'https://openbitcointracker.com',
  i18n: {
    defaultLocale: defaultLang,
    locales: languages.map(({ code, loc }) => ({ path: loc, codes: code === loc ? [code] : [code, loc] })),
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  integrations: [
    react({ include: ["**/features/earth/**/*.tsx"] }),
    sitemap({
      // Keys are URL path segments, values are the hreflang code emitted for
      // each — so /pt/ pages advertise hreflang="pt-BR".
      i18n: {
        defaultLocale: defaultLang,
        locales: Object.fromEntries(languages.map(({ code, loc }) => [loc, code])),
      },
    }),
  ],
  vite: {
    plugins: [
      tailwindcss(),
      {
        name: 'obt-vite-cache',
        // Builds and tests must not replace the running dev server's prebundles.
        config(_config, { mode }) {
          return { cacheDir: `node_modules/.vite/obt-${mode}` };
        },
      },
    ]
  }
});
