# Open Bitcoin Tracker — Website

Live BTC/USD chart and website for [Open Bitcoin Tracker](https://github.com/Max-Hodler/open-bitcoin-tracker), an open-source Bitcoin portfolio tracker for Android.

Astro 6, TypeScript, and Tailwind CSS 4, with static pages and a Cloudflare Pages Function for language redirects.

## Development

Use Node.js **22.12.0 or newer** (`.nvmrc` selects Node 22).

```sh
npm ci
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm test` | Run chart motion and range pill tests |
| `npm run build` | Generate the production site in `dist/` |
| `npm run preview` | Serve the built site locally |

The build does not run a full TypeScript check. Local development and preview do not run the Pages Function.

## Pages and languages

- `/`: Open Bitcoin Tracker landing page with access to the price tracker and Android app.
- `/price-tracker/`: live Bitcoin price and interactive price history since July 2010.
- `/android-app/`: Android app overview and download links.
- `/about/` and `/privacy/`: project information and the app privacy policy.

All pages support English, Spanish, Brazilian Portuguese, Russian, Turkish, Vietnamese, Japanese, French, German, and Italian. English has no URL prefix; Portuguese uses `/pt/` with code `pt-BR`; others use their language code.

On Cloudflare Pages, `functions/_middleware.js` honors a valid `lang` cookie on root visits; otherwise it detects `Accept-Language` and stores the result for 180 days. The switcher links to the same page in another language.

## Price chart

The chart defaults to All time and logarithmic scale. Select or drag the range pill; use chevrons or Up/Down to cycle the selected count. Log/Lin switches scale. Press and drag to inspect prices, or focus the chart and use Left/Right, Home/End, and Escape. Releasing restores the live price and range change. Transitions respect reduced motion.

Prices come directly from Kraken in the browser:

- WebSocket ticker for live BTC/USD, with REST polling every 30 seconds while the stream is unavailable.
- 15-minute candles for day ranges; hourly candles for weeks and one month. These refresh every minute while selected.
- Daily history for longer ranges, merging bundled data with recent candles by UTC day every five minutes.

Intraday ranges may be shorter than requested because Kraken limits available candles. The bundled chart renders without JavaScript; live prices and controls require it.

## Maintenance

| Location | Purpose |
| --- | --- |
| `src/pages/`, `src/components/pages/` | Routes and shared page content |
| `src/components/`, `src/layouts/`, `src/styles/` | UI, metadata, and styles |
| `src/lib/`, `src/scripts/` | Chart calculations and browser interactions |
| `src/i18n/locales/en.ts`, `src/i18n/ui.ts` | English page copy and dictionary types |
| `src/i18n/tracker.ts`, `src/i18n/ranges.ts` | Chart copy for every language |
| `astro.config.mjs` | Site URL, locale routing, sitemap, and build configuration |
| `functions/_middleware.js`, `wrangler.toml` | Cloudflare Pages language redirect and runtime configuration |

Keep `public/data/btc-history.csv` synchronized with the Android project's `assets/btc_history.csv` (Coin Metrics history). The format is `YYYY-MM-DD,USD_PRICE`, one daily point per line, with no header. Recent candles must connect to the bundled history without missing days. Gaps or failed requests preserve existing history and display an error; the live price updates separately.

New languages need dictionaries, chart copy, route `getStaticPaths()` entries, Astro/sitemap locale configuration, layout alternates, switcher entries, and middleware matchers.

For Cloudflare Pages, build with `npm run build`, serve `dist/`, and include `functions/`. `wrangler.toml` pins the runtime compatibility date.

Licensed under [MIT](./LICENSE).
