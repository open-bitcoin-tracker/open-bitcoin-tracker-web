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
| `npm test` | Run chart motion, range pill and supply model/control tests |
| `npm run test:earth` | Run map, calculation, preferences, and theme tests |
| `npm run check:earth` | Type-check the Earth feature and its tests |
| `npm run check:supply` | Type-check the supply model, browser script, and refresh path |
| `npm run refresh:supply` | Refresh US M2 or import reviewed official monetary observations |
| `npm run build` | Generate the production site in `dist/` |
| `npm run preview` | Serve the built site locally |

The build does not run a full TypeScript check. Local development and preview do not run the Pages Function.

## Pages and languages

- `/`: Open Bitcoin Tracker landing page with access to the price tracker, Android app, A Bit of Earth, and the monetary supply comparison.
- `/price-tracker/`: live Bitcoin price and interactive price history since July 2010.
- `/android-app/`: Android app overview and download links.
- `/a-bit-of-earth/`: interactive map comparing a Bitcoin amount with a share of Earth's land.
- `/bitcoin-and-the-dollar/`: Bitcoin’s maximum alongside one selected asset, with main asset cards, one shared population card, then separate per-person cards.
- `/about/` and `/privacy/`: project information and the app privacy policy.

All pages support English, Spanish, Brazilian Portuguese, Russian, Turkish, Vietnamese, Japanese, French, German, and Italian. English has no URL prefix; Portuguese uses `/pt/` with code `pt-BR`; others use their language code.

On Cloudflare Pages, `functions/_middleware.js` honors a valid `lang` cookie on root visits; otherwise it detects `Accept-Language` and stores the result for 180 days. The switcher links to the same page in another language. The Bitcoin vs fiat feature currently uses English content on every localized route; its surrounding navigation remains localized.

## A Bit of Earth

The map is a browser-rendered React feature inside Astro, adapted from [A Bit of Earth](https://github.com/Max-Hodler/bitcoin-land). It uses MapLibre GL and a bundled worker, with scoped styles, the shared site palette and UI typography, and Titillium Web for the map readout (the font license is included in `public/earth/fonts/OFL.txt`). The calculator, location search, measurements, and guide currently use English on every localized route; the surrounding navigation and landing descriptions are translated.

Bitcoin amounts are calculated locally. Location search sends only the submitted place query to Photon at `https://photon.komoot.io/api/`. Set `PUBLIC_EARTH_GEOCODER_URL` at build time to use another compatible endpoint. Map tiles and glyphs are fetched directly from the providers specified in `src/features/earth/map/style.json`; attribution remains visible on desktop and mobile. The page suppresses referrer headers.

The map follows the existing `theme` preference controlled by the shared site menu. Measurements are always available at the map's bottom-left corner; the separate mobile map menu opens the guide. The source project remains independently maintained; its standalone build and exports are not part of this website.

## Bitcoin vs fiat

The comparison shows **Bitcoin’s 21 million maximum under current consensus rules** alongside one selected asset, defaulting to US M2. Main total/illustration cards come first, followed by one centered worldwide population card spanning the layout, then two separate per-person cards with one standing person each. Total and per-person columns align at wider widths; mobile retains this section order and labels every per-person card with its asset name. The Bitcoin box contains exactly 21 visible coins in three rows of seven. Supply labels sit below their totals. A keyboard-accessible selector replaces the selected asset’s heading beside its icon, offering gold and five fiat currencies (USD, EUR, JPY, CNY and GBP). Its native disclosure and option panel share the language dropdown’s style; arrows, Home/End, first letters, Tab, Enter/Space, Escape and outside dismissal work without resetting the clock. Asset changes reuse the same nodes and clock, keeping pause state, reduced motion, expiry handling and Bitcoin’s fixed visit share intact. Without JavaScript, the default Bitcoin/US M2 comparison shows recorded observations and per-person amounts, with interactive controls hidden.

Bitcoin’s maximum is not the already circulating amount. Gold is a commodity measured by mass, not fiat money or a monetary aggregate. Broad money includes deposits and other liquid instruments, not only printed cash. Definitions, coverage, seasonal adjustment and source precision differ; there is no currency conversion, purchasing-power comparison or global sum. Equal shares are a thought experiment, not actual distribution, an entitlement or a limit on holdings. The existing `/bitcoin-and-the-dollar/` route remains available in every locale, with English feature content and localized navigation.

Gold uses the [World Gold Council above-ground stock dataset](https://www.gold.org/goldhub/data/how-much-gold): **222,600 tonnes at June 30, 2026**, published August 18, 2026, rounded by the source to the nearest 100 tonnes. This replaces the older end-2025 estimate rather than adding mining twice. The [January 29, 2026 full-year supply report](https://www.gold.org/goldhub/research/gold-demand-trends/gold-demand-trends-full-year-2025/supply) provides **3,671.6 tonnes mined in 2025**; attribution is Metals Focus, Refinitiv GFMS and World Gold Council.

The gold model starts with that quarterly stock at **July 1, 2026, 00:00 UTC** and adds the full 2025 mined amount divided by actual seconds in 2025 (about **116.43 grams/second**). It uses a constant historical pace, not a forecast, the change in annual mine output, total market supply or recycling. Recycling and hedging add no newly mined metal. The quarterly stock and annual mining observations have separate dates/vintages; differences from older stock estimates can include revisions and must not be used to infer mining. Gold is physically finite, but total recoverable gold is uncertain and no fixed numerical cap is invented.

Gold’s projection runs only after its stock publication and expires **90 days after that publication**, on **November 16, 2026, 00:00 UTC**, independently of fiat expiry. A publication-based horizon accommodates the quarterly reporting delay. It then shows the recorded stock until reviewed. The projection counter shows tonnes to three decimals to illustrate slow mining growth; these digits are not measured precision. Recorded stock keeps whole-tonne formatting. The equal share uses unrounded tonnes × 1,000,000 grams/tonne ÷ population at the same model time and displays two decimals in grams. Symbolic bars have no measured relation to mining speed or box size.

`src/features/supply/snapshot.json` stores the observations and official source links. The initial bundle was reviewed on October 11, 2026. All monetary pairs compare August 2026 with August 2025:

| Currency | Series and coverage | Adjustment / basis | Source units → native units | Latest / previous-year source values | Latest release |
| --- | --- | --- | --- | --- | --- |
| US dollar | Federal Reserve H.6, M2SL | Seasonally adjusted, monthly average | billions × 1,000,000,000 | 23,342.8 / 22,092.6 | September 22, 2026 |
| Euro | ECB `BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E`, euro area changing composition, M2 | Seasonally and working-day adjusted, end-month | millions × 1,000,000 | 16,447,405 / 15,762,736 | September 25, 2026 |
| Japanese yen | BOJ `MD02'MAM1NAM2M2MO`, M2 average amounts outstanding | Not seasonally adjusted, monthly average | hundred millions × 100,000,000 | 12,963,895 / 12,712,263 | September 9, 2026 |
| Chinese yuan | PBC Financial Statistics Reports, broad money M2 | Not seasonally adjusted, end-month | trillions × 1,000,000,000,000 | 356.81 / 331.98 | September 14, 2026 |
| Pound sterling | BOE Table J, `B53Q`, M4 excluding intermediate OFCs (M4ex), amounts outstanding | Seasonally adjusted, end-month | billions × 1,000,000,000 | 3,064.747 / 2,941.749 | September 29, 2026 |

ECB August 2026 is provisional. BOJ’s historical point comes from the currently published series, including revisions. PBC’s prior point comes from the September 12, 2025 report. BOE’s prior point comes from its original September 29, 2025 Table J workbook; this uses different release vintages. Stock differences may include revisions, valuation changes and breaks and must not be described as the banks’ adjusted flows or published annual growth rates. Use M2 rather than aggregate financing for China, and M4ex rather than M4 lending or monthly flows for the UK.

Each fiat extrapolates **its own** historical average `(latest − same month in the previous year) / actual elapsed seconds`, including leap days. Every monthly series is anchored at the next month’s start, **00:00 UTC**: this is a modeling convention, especially for monthly averages which have no precise instant. Negative rates remain negative and symbolic bills leave that currency’s box during contraction. Flat, unavailable and expired series do not inherit motion from other currencies or population. Each projection expires independently **90 days after its anchor**, returning to its own recorded observation. For the initial August observations, the cutoff is November 30, 2026 at 00:00 UTC. Whole native currency digits illustrate the model, not source precision.

Population comes from UN WPP 2024 **Medium variant**, **World** (location 900), **Total Population, as of 1 July**, both sexes. The official compact demographic indicators workbook, “Medium variant” sheet, rows 19–22, column M, supplies these points (thousands converted to people): **2025 = 8,231,613,070**, **2026 = 8,300,678,395**, **2027 = 8,369,094,344**, **2028 = 8,436,618,886**. The workbook and portal can differ by a person from rounding; retain the chosen source consistently. These are annual demographic projections, not live censuses.

Population is interpolated linearly between adjacent July 1 totals, anchored at **00:00 UTC**, using actual interval length. Its slope is **net world population change**, reflecting births minus deaths, rather than births alone (about 2.17 people per second in the current interval). Negative changes remain negative. The model runs only from **July 1, 2025 through July 1, 2028**, using the nearest annual endpoint outside that range, and rounds to whole people.

The population heading has a decorative Earth icon matching the asset icons’ size, and its counter uses the neutral numeric text color. The card retains its static globe/people illustration without a redundant subtitle. The figures are decorative and symbolic, with no assigned population share; the accessible heading, number and source methodology provide the demographic information. Each per-person amount appears once in a separate asset-labeled card after the shared population card, aligned with its main asset column where space permits, labeled “per person” with native units and a single person illustration. The comparison shows two per-person amounts. The shared pause control remains at the bottom, below the cards and source disclosure.

Bitcoin’s maximum and Bitcoin per person stay fixed for a visit. The browser captures the population estimate at page load for Bitcoin’s denominator and documents it in the disclosure. Each fiat share divides its own displayed amount by population at the same displayed model time, using unrounded estimates and rounding to whole native currency without accelerating tiny changes. A single pause freezes gold, all fiat and population estimates, bars and bills; reduced motion starts with a still view. Range and expiry checks continue in both modes. Hidden pages stop timers and catch up from the actual clock when shown again. Without JavaScript, recorded gold/monetary observations and July 1, 2026 population render with their equal shares. All detailed sources and methods sit in one initially collapsed disclosure.

Refresh and verify before building:

```sh
npm run refresh:supply
npm run check:supply
npm test
npm run build
```

The default refresh reads only seasonally adjusted M2 from the official H.6 table. It requires the same-month observation one year earlier, rejects older releases, validates the result, atomically replaces the snapshot and leaves all other currencies and population untouched. For a blocked download, use `npm run refresh:supply -- --file downloaded-h6.html`. Network, parsing or validation failure preserves the existing bundle and exits unsuccessfully.

The other four series use a **manual official-source review and validated import**, rather than automatic downloads. Download or inspect the official sources linked in the snapshot, verify the selected definition/adjustment, latest release date, same-month previous-year point and source units, and prepare a JSON array for `npm run refresh:supply -- --import reviewed-money.json`. Each entry has this shape (values remain in the source units, not already multiplied native units):

```json
[{
  "id": "eur",
  "sourceMultiplier": 1000000,
  "latest": { "month": "2026-08", "value": 16447405 },
  "previousYear": { "month": "2025-08", "value": 15762736 },
  "releasedAt": "2026-09-25",
  "source": "https://www.ecb.europa.eu/press/stats/md/html/ecb.md2608~406f8d243d.en.html",
  "dataSource": "https://data.ecb.europa.eu/data/datasets/BSI/BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E",
  "previousDataSource": "https://data.ecb.europa.eu/data/datasets/BSI/BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E",
  "definitionSource": "https://www.ecb.europa.eu/stats/money_credit_banking/monetary_aggregates/html/index.en.html",
  "note": "Euro area with changing composition; August 2026 is provisional."
}]
```

Imports preserve the selected series, definition, adjustment and unit metadata, enforce each currency’s multiplier, require an official release host, reject duplicate currencies/invalid windows/older releases and validate the entire resulting bundle before writing. A failed entry preserves the full previous bundle. Validation does not authenticate the observations: source review remains necessary. Series definition changes require a reviewed model/metadata change, not a silent import. `checkedAt` is per currency; the top-level date records the last bundle update.

Gold is reviewed **manually each quarter**. Update `gold.stock` from the linked WGC stock dataset with its quarter-end date, source rounding and publication date. Review the latest complete annual mine-production observation and preserve its year, release vintage and source in `gold.mineProduction`. Use mine production alone; do not add recycling, hedging or infer mining from revised stock differences. Update the gold/bundle check dates, run the checks and rebuild. Monetary refreshes preserve gold untouched.

Population is reviewed **manually each year**, or when a new WPP revision is available. Download the linked workbook, select adjacent World / Medium / both-sexes July 1 totals, convert thousands to people, and update `points` and static fallback `persons`/`date` together. The fallback must match a bundled point. Keep revision, variant and source consistent, run the checks and rebuild. Monetary refreshes leave population untouched.

The static site has no live feed or background refresh service. Rebuild after updates; until then, old source dates remain visible and expired projections fall back to recorded data. Supply tests cover native scaling, gold mass/gram conversion and mine output, independent rates/expiry/signs, leap days, population interpolation, shared controls, reduced motion, hidden tabs, fixed Bitcoin shares and conservative refresh/import behavior.

The “Show Bitcoin in sats” checkbox above the cards switches both Bitcoin card amounts between BTC (the default) and whole satoshis. Sats use 100,000,000 per BTC, keep the ₿ prefix and add “sats” after the number. Per-person sats round from the unrounded share fixed at page load; switching units or assets preserves that basis and the shared pause state.

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
| `src/features/earth/`, `public/earth/` | Earth map, calculations, scoped styles, tests, and fonts |
| `src/i18n/locales/en.ts`, `src/i18n/ui.ts` | English page copy and dictionary types |
| `src/i18n/tracker.ts`, `src/i18n/ranges.ts` | Chart copy for every language |
| `src/i18n/supply.ts`, `src/features/supply/`, `scripts/refresh-supply.ts` | English supply-page copy, official snapshot, model, and refresh script |
| `astro.config.mjs` | Site URL, locale routing, sitemap, and build configuration |
| `functions/_middleware.js`, `wrangler.toml` | Cloudflare Pages language redirect and runtime configuration |

Keep `public/data/btc-history.csv` synchronized with the Android project's `assets/btc_history.csv` (Coin Metrics history). The format is `YYYY-MM-DD,USD_PRICE`, one daily point per line, with no header. Recent candles must connect to the bundled history without missing days. Gaps or failed requests preserve existing history and display an error; the live price updates separately.

New languages need dictionaries, chart copy, route `getStaticPaths()` entries, Astro/sitemap locale configuration, layout alternates, switcher entries, and middleware matchers.

For Cloudflare Pages, build with `npm run build`, serve `dist/`, and include `functions/`. `wrangler.toml` pins the runtime compatibility date.

Licensed under [MIT](./LICENSE).
