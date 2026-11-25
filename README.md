# Open Bitcoin Tracker

[openbitcointracker.com](https://openbitcointracker.com) — Bitcoin price tools, supply visualizations, and the [Android app](https://github.com/open-bitcoin-tracker/open-bitcoin-tracker). Built with Astro, TypeScript, Tailwind CSS, and React.

## Development

Requires **Node.js 22.12.0+** (see `.nvmrc`). No API keys.

```sh
npm ci
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm run build` / `npm run preview` | Build to `dist/` / preview |
| `npm run check` | TypeScript checks; excludes Astro templates |
| `npm test` | Unit tests in `tests/` |
| `npm run test:earth` / `npm run check:earth` | Earth tests / types |
| `npm run check:supply` | Supply and refresh types |

Builds do not perform a full TypeScript check. After UI changes, rebuild; after logic changes, run the relevant checks above. Preserve keyboard controls, reduced motion, localized routes, and unavailable-data gaps.

## Structure and data

- Routes: `/`, `/price-tracker/`, `/video-mode/`, `/android-app/`, `/a-bit-of-earth/`, `/global-wealth/`, `/bitcoin-and-the-dollar/` (Money per Person, hidden from navigation), `/about/`, `/android-app/about/`, `/privacy/`; each also under a locale prefix.
- Pages: `src/pages/`, `src/components/pages/`; shared UI: `src/components/ui/`, `src/layouts/`, `src/styles/`; browser logic: `src/lib/`, `src/scripts/`; Earth/supply/wealth: `src/features/`; assets: `public/`.
- Prices: Kraken (live) and bundled Coin Metrics history. FX: ECB rates through Frankfurter. Maps: MapLibre and OpenFreeMap. Place search runs locally; the tile provider receives IP addresses and viewed map areas.
- Preferences such as fiat currency are stored in the browser and shared across pages, locales, and open tabs. Price on Video setups can be shared as a versioned URL fragment, which takes priority over saved preferences without overwriting them.
- Supply definitions, units, dates, and sources: [supply snapshot](src/features/supply/snapshot.json). Global Wealth combines live Bitcoin and gold prices with annual reports and official broad money, converted in US dollars at one ECB date (or the issuing central bank's `rate` where the ECB has none): [wealth snapshot](src/features/wealth/snapshot.json).

## Maintenance

**Prices:** Run `npm run refresh:prices` (or `-- --file coinmetrics-response.json`). Review appended completed UTC days, synchronize `public/data/btc-history.csv` with Android's `assets/btc_history.csv`, then test and build. Format: `YYYY-MM-DD,USD_PRICE`, no header. Preserve history and gaps; never invent prices. Invalid or incomplete refreshes leave the file unchanged.

**Supply:** Run `npm run refresh:supply`, review, then `npm run check:supply`, `npm test`, and `npm run build`. Refresh updates seasonally adjusted US M2 only. Use `-- --file downloaded-h6.html` or `-- --import reviewed-money.json`; imports follow [ReviewedMoneyImport](src/features/supply/refresh.ts) in source units. Verify definitions, series, adjustments, units, dates, and release vintage against official sources. Validation cannot authenticate observations; definition changes need model/metadata review. Failed refreshes preserve the snapshot.

Review population annually or after UN WPP revisions: World / Medium / both sexes / Total Population as of 1 July, converting thousands to people. Update `points`, fallback `persons`/`date`, and `checkedAt` together. Keep `scenarioPoints` covering today's UTC date through 15 years ahead with adjacent endpoints from one revision/source. Run supply checks and rebuild; monetary refreshes leave population untouched.

**Global Wealth:** Review yearly, or when Savills (world real estate), SIFMA (Capital Markets Fact Book bonds and equities), the World Gold Council (above-ground gold), or the Silver Institute (above-ground silver) publish new editions. Update each value with its `asOf` date and source together, refresh the reference block (`referenceHeight`/`referenceTime`), fallback BTC and PAXG prices, the silver price and its date, and ECB `usdRates`/`fxDate` together, and set `checkedAt`. Broad money for the supply page's five currencies follows the supply refresh automatically; update each `fiat.more` amount, month and source from its central bank, with an ECB rate for every currency except those carrying their own central bank's `rate` for `fxDate`. Run `npm test` and rebuild; invalid snapshots fail the build.

**Earth:** Review capital names and coordinates together in `src/features/earth/lib/capitals.json`. Regenerate cities with `python3 scripts/import-earth-cities.py <geojson>` using the exact download in [cities-source.json](src/features/earth/lib/cities-source.json). New releases require review of the importer's revision, checksum, names, country codes, coordinates, and date. Run Earth tests/types, `npm test`, and build.

**Languages:** Keep `src/i18n/` dictionaries consistent. New languages need `languages.ts`, their dictionary and `ui.ts` registration, plus `tracker.ts`, `ranges.ts`, `chart-settings.ts`, `live-price.ts`, `video.ts`, `earth.ts`, and `wealth.ts`. Routing, sitemap, alternates, switching, and redirects share locale metadata. English uses root URLs; other languages use their `loc` prefix (Portuguese: `/pt/`, code `pt-BR`). Supply remains English. Run `npm run check`, build, and review generated routes.

**Videos and images:** Curated videos live in `src/lib/video-suggestions.ts`, along with `defaultVideoId`, the video first-time visitors see on Price on Video; verify IDs, titles, live/silent status, and translated section labels in `src/i18n/video.ts`. Preview backgrounds and source links live in `src/lib/video-preview-backgrounds.ts`; use silent H.264 MP4s and matching WebP posters. Recapture Earth previews in both themes after appearance changes. Run `npm run generate:social` after social/icon changes, review output, bump the image URL version in `src/layouts/Layout.astro`, and rebuild.

**Fonts:** After replacing `public/fonts/InterVariable.woff2`, install `scripts/fonts/requirements.txt` in a Python virtual environment, run `npm run generate:fonts`, `npm run check:fonts`, and build. Preserve font licenses; review localized routes. Normal builds use checked-in subsets.

## Deployment and licenses

Cloudflare Pages: build with `npm run build`, output `dist/`, include `functions/`. Runtime: `wrangler.toml`; site/locales/sitemap: `astro.config.mjs`. Language redirects use cookies/browser language and do not run in dev/preview. Forks must review `public/robots.txt` and project/download links.

Application code: [MIT](LICENSE). Coin Metrics [Community data](https://coinmetrics.io/community-data/): [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Adapted capitals: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), from [mledoze/countries](https://github.com/mledoze/countries), [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) (public domain), and [GeoNames](https://www.geonames.org/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). Cities: Natural Earth, public domain. Earth previews: © [OpenMapTiles](https://openmaptiles.org/) and © [OpenStreetMap](https://www.openstreetmap.org/copyright). Preserve licenses in `public/fonts/`, `public/earth/fonts/`, and `scripts/fonts/`.
