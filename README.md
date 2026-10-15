# Open Bitcoin Tracker — Website

[openbitcointracker.com](https://openbitcointracker.com): Bitcoin price tools, supply visualizations, and the [Android app](https://github.com/Max-Hodler/open-bitcoin-tracker) overview. Built with Astro, TypeScript, Tailwind CSS, and React for the Earth map. Static output with a Cloudflare Pages Function for language redirects.

## Development

Requires Node.js **22.12.0+** (`.nvmrc` selects Node 22). No API keys needed.

```sh
npm ci
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm run build` | Build to `dist/`; does not perform a full TypeScript check |
| `npm run preview` | Preview the build locally |
| `npm test` | Chart, currency, preferences, browser, supply, and refresh tests |
| `npm run test:earth` | Earth feature tests |
| `npm run check:earth` | Type-check Earth and its tests |
| `npm run check:supply` | Type-check supply, refresh logic, and tests |
| `npm run refresh:supply` | Refresh US M2 from the Federal Reserve H.6 release |
| `npm run generate:social` | Regenerate social preview PNGs for all languages |

Development and preview do not run the Pages Function.

## Pages

| Route | Content |
| --- | --- |
| `/` | Home |
| `/price-tracker/` | Live price and history since July 2010 |
| `/party-mode/` | Live price with local music and an audio visualizer |
| `/video-mode/` | Live price over a YouTube video |
| `/android-app/` | Android app and downloads |
| `/a-bit-of-earth/` | Bitcoin amounts as shares of Earth's land |
| `/bitcoin-and-the-dollar/` | Money per Person: Bitcoin and five fiat supplies |
| `/about/`, `/privacy/` | Project information and Android privacy policy |

Money per Person is accessible by URL but hidden from the home page and menu pending further work.

All routes support English, Spanish, Brazilian Portuguese, Russian, Turkish, Vietnamese, Japanese, French, German, and Italian. English uses root URLs; Portuguese uses `/pt/` with dictionary code `pt-BR`; other languages use their code. Earth and supply feature content remains English.

On Cloudflare Pages, unprefixed routes use the saved `lang` cookie or browser language, falling back to English. Explicit localized URLs keep their language; the switcher preserves the current page.

## Data sources

- **Prices:** Kraken WebSocket with REST fallback; bundled Coin Metrics daily history. EUR, GBP, AUD, CAD, CHF, and JPY use daily ECB reference rates through Frankfurter, not live exchange quotes. Missing data remains unavailable.
- **Party Mode:** Audio files stay on the device; files and filenames are not uploaded or saved.
- **Video Mode:** Uses YouTube's privacy-enhanced embeds and IFrame Player API after a link is submitted or a saved video is restored. Video and display preferences are stored locally.
- **Earth:** Adapted from [bitcoin-land](https://github.com/Max-Hodler/bitcoin-land). Maps `BTC / 21,000,000 × 148,940,000 km²` with MapLibre GL. Calculations stay local; location searches go to Photon. Set `PUBLIC_EARTH_GEOCODER_URL` at build time for a compatible alternative. Tile/glyph providers are in `src/features/earth/map/style.json`; keep attribution visible.
- **Money per Person:** Official money observations and UN population data are bundled in [snapshot.json](src/features/supply/snapshot.json), including definitions, units, dates, and sources. The page's Sources & method panel explains projections and scenarios. These are illustrative estimates; money definitions differ across currencies. Snapshot updates require a rebuild.

## Maintenance

### Price history

Keep `public/data/btc-history.csv` synchronized with the Android project's `assets/btc_history.csv`: `YYYY-MM-DD,USD_PRICE`, one daily point per line, no header. Preserve existing history and unavailable states; never invent prices to fill gaps.

### Supply snapshot

```sh
npm run refresh:supply
npm run check:supply
npm test
npm run build
```

The refresh updates only seasonally adjusted US M2, requires the same-month observation one year earlier, rejects older releases, and preserves the snapshot on failure. For a downloaded official release, use `npm run refresh:supply -- --file downloaded-h6.html`.

For other currencies, review the snapshot's official sources and run `npm run refresh:supply -- --import reviewed-money.json`. Supply a JSON array matching [ReviewedMoneyImport](src/features/supply/refresh.ts), with values in **source units**, not scaled native units. Verify definitions, series, adjustments, units, dates, and historical release vintage: validation does not authenticate observations. Definition changes require a reviewed model/metadata update.

Review population annually or after a new UN WPP revision. Use World / Medium / both-sexes **Total Population, as of 1 July**, converting thousands to people. Update `points`, fallback `persons`/`date`, and `checkedAt` together. Keep `scenarioPoints` covering today's UTC date plus 15 years, with adjacent interpolation endpoints, using one consistent revision and source. Run the supply checks and rebuild. Monetary refreshes leave population untouched.

### Translations and social previews

Page dictionaries live in `src/i18n/locales/`; chart, Party Mode, and Video Mode copy lives in the other `src/i18n/` dictionaries. Keep all languages consistent and rebuild after copy changes.

To add a language, update:

- Its dictionary and registration in `src/i18n/ui.ts`.
- `tracker.ts`, `ranges.ts`, `chart-settings.ts`, `party.ts`, and `video.ts`.
- Every `src/pages/[lang]/` route's `getStaticPaths()`.
- Astro locales and sitemap configuration, layout alternates, switcher entries, and middleware matchers.
- `scripts/generate-social-images.ts` and the generated image.

After changing social copy or tool labels, run `npm run generate:social`, review every `public/og-bitcoin-tools*.png`, and rebuild. Generation requires **Noto Sans** and **Noto Sans CJK JP**; normal builds use the checked-in PNGs. Review generated routes when adding a language. Earth and supply need separate feature translation work.

## Source layout

- `src/pages/`, `src/components/pages/`: routes and page content.
- `src/components/`, `src/layouts/`, `src/styles/`: shared UI, metadata, and styles.
- `src/lib/`, `src/scripts/`, `tests/`: logic, browser interactions, and tests.
- `src/features/earth/`, `src/features/supply/`: feature code, assets, and supply snapshot.
- `public/`: static assets; `src/assets/screenshots/`: responsive app screenshots.

## Deployment

Cloudflare Pages: build with `npm run build`, serve `dist/`, and include `functions/`. See `wrangler.toml` for runtime configuration and `astro.config.mjs` for the site URL, locales, and sitemap. Forks and custom domains should also update `public/robots.txt` and project/download links.

[MIT](LICENSE). Preserve bundled font licenses in `public/fonts/` and `public/earth/fonts/`.
