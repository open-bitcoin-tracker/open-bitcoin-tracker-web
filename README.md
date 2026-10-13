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
- `/bitcoin-and-the-dollar/`: Bitcoin’s maximum alongside one selected asset, with one shared population readout above the main asset cards, then separate per-person cards.
- `/about/` and `/privacy/`: project information and the app privacy policy.

All pages support English, Spanish, Brazilian Portuguese, Russian, Turkish, Vietnamese, Japanese, French, German, and Italian. English has no URL prefix; Portuguese uses `/pt/` with code `pt-BR`; others use their language code.

On Cloudflare Pages, `functions/_middleware.js` honors a valid `lang` cookie on root visits; otherwise it detects `Accept-Language` and stores the result for 180 days. The switcher links to the same page in another language. The Money per Person feature currently uses English content on every localized route; its surrounding navigation remains localized.

## A Bit of Earth

The map is a browser-rendered React feature inside Astro, adapted from [A Bit of Earth](https://github.com/Max-Hodler/bitcoin-land). It uses MapLibre GL and a bundled worker, with scoped styles, the shared site palette and UI typography, and Titillium Web for the map readout (the font license is included in `public/earth/fonts/OFL.txt`). The calculator, location search, measurements, and guide currently use English on every localized route; the surrounding navigation and landing descriptions are translated.

Bitcoin amounts are calculated locally. Location search sends only the submitted place query to Photon at `https://photon.komoot.io/api/`. Set `PUBLIC_EARTH_GEOCODER_URL` at build time to use another compatible endpoint. Map tiles and glyphs are fetched directly from the providers specified in `src/features/earth/map/style.json`; attribution remains visible on desktop and mobile. The page suppresses referrer headers.

The map follows the existing `theme` preference controlled by the shared site menu. Measurements are always available at the map's bottom-left corner; the separate mobile map menu opens the guide. The source project remains independently maintained; its standalone build and exports are not part of this website.

## Money per Person

The comparison shows **Bitcoin’s 21 million maximum under current consensus rules** alongside one selected asset, defaulting to US M2. Year controls come first, followed by one centered worldwide population readout spanning the layout, above the main total/illustration cards, then two separate per-person cards. Total and per-person columns align at wider widths; mobile retains this section order and uses headings such as “Bitcoin per person” and “US Dollar per person” for every asset. The Bitcoin box contains exactly 21 visible coins in three rows of seven. Fiat notes pass in front of the rear rim through the opening, descend within the box, and disappear into the stored pile behind the front wall. A keyboard-accessible selector replaces the selected asset’s heading, offering five fiat currencies (USD, EUR, JPY, CNY and GBP). Its native disclosure and option panel share the language dropdown’s style; arrows, Home/End, first letters, Tab, Enter/Space, Escape and outside dismissal work without resetting the clock. Asset changes reuse the same nodes and clock, keeping reduced motion, expiry handling and Bitcoin’s active share basis intact. Without JavaScript, the default Bitcoin/US M2 comparison shows recorded observations and per-person amounts, with interactive controls hidden.

Bitcoin’s maximum is not the already circulating amount. Broad money includes deposits and other liquid instruments, not only printed cash. Definitions, coverage, seasonal adjustment and source precision differ; there is no currency conversion, purchasing-power comparison or global sum. Equal shares are a thought experiment, not actual distribution, an entitlement or a limit on holdings. The existing `/bitcoin-and-the-dollar/` route remains available in every locale, with English feature content and localized navigation.


`src/features/supply/snapshot.json` stores the observations and official source links. The initial bundle was reviewed on October 11, 2026. All monetary pairs compare August 2026 with August 2025:

| Currency | Series and coverage | Adjustment / basis | Source units → native units | Latest / previous-year source values | Latest release |
| --- | --- | --- | --- | --- | --- |
| US Dollar | Federal Reserve H.6, M2SL | Seasonally adjusted, monthly average | billions × 1,000,000,000 | 23,342.8 / 22,092.6 | September 22, 2026 |
| Euro | ECB `BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E`, euro area changing composition, M2 | Seasonally and working-day adjusted, end-month | millions × 1,000,000 | 16,447,405 / 15,762,736 | September 25, 2026 |
| Japanese yen | BOJ `MD02'MAM1NAM2M2MO`, M2 average amounts outstanding | Not seasonally adjusted, monthly average | hundred millions × 100,000,000 | 12,963,895 / 12,712,263 | September 9, 2026 |
| Chinese yuan | PBC Financial Statistics Reports, broad money M2 | Not seasonally adjusted, end-month | trillions × 1,000,000,000,000 | 356.81 / 331.98 | September 14, 2026 |
| Pound sterling | BOE Table J, `B53Q`, M4 excluding intermediate OFCs (M4ex), amounts outstanding | Seasonally adjusted, end-month | billions × 1,000,000,000 | 3,064.747 / 2,941.749 | September 29, 2026 |

ECB August 2026 is provisional. BOJ’s historical point comes from the currently published series, including revisions. PBC’s prior point comes from the September 12, 2025 report. BOE’s prior point comes from its original September 29, 2025 Table J workbook; this uses different release vintages. Stock differences may include revisions, valuation changes and breaks and must not be described as the banks’ adjusted flows or published annual growth rates. Use M2 rather than aggregate financing for China, and M4ex rather than M4 lending or monthly flows for the UK.

Each fiat extrapolates **its own** historical average `(latest − same month in the previous year) / actual elapsed seconds`, including leap days. Every monthly series is anchored at the next month’s start, **00:00 UTC**: this is a modeling convention, especially for monthly averages which have no precise instant. Negative rates remain negative and symbolic bills leave that currency’s box during contraction. Flat, unavailable and expired series do not inherit motion from other currencies or population. Each projection expires independently **90 days after its anchor**, returning to its own recorded observation. For the initial August observations, the cutoff is November 30, 2026 at 00:00 UTC. Whole native currency digits illustrate the model, not source precision.

Population comes from UN WPP 2024 **Medium variant**, **World** (location 900), **Total Population, as of 1 July**, both sexes. The official compact demographic indicators workbook, “Medium variant” sheet, rows 19–22, column M, supplies these points (thousands converted to people): **2025 = 8,231,613,070**, **2026 = 8,300,678,395**, **2027 = 8,369,094,344**, **2028 = 8,436,618,886**. The workbook and portal can differ by a person from rounding; retain the chosen source consistently. These are annual demographic projections, not live censuses.

Population is interpolated linearly between adjacent July 1 totals, anchored at **00:00 UTC**, using actual interval length. Its slope is **net world population change**, reflecting births minus deaths, rather than births alone (about 2.17 people per second in the current interval). Negative changes remain negative. The model runs only from **July 1, 2025 through July 1, 2028**, using the nearest annual endpoint outside that range, and rounds to whole people.

The comparison uses the available screen width, with larger type and illustrations on large displays. Desktop spacing and artwork also respond to viewport height to keep the comparison and controls on screen; mobile stacks the cards. Sources & method opens a centered, scrollable modal with Bitcoin, population and calculation context plus only the selected fiat’s definition, observations and source links. The modal supports Escape, outside dismissal and focus restoration; without JavaScript, a disclosure shows the default US M2 methodology. The population count sits beneath its heading and uses the same number size as the Bitcoin and fiat totals at every viewport size. Population, asset and per-person headings use text without decorative icons. The population counter uses the neutral numeric text color. The population readout has no card background or visible border and keeps the heading and numeric count in place, without a large illustration or subtitle beneath the number. Estimate context remains in the sources modal. Each per-person amount appears once in a separate asset-labeled card below the main asset cards, aligned with its main asset column where space permits, labeled “per person” with native units. The comparison shows two per-person amounts. The page has no pause button; reduced-motion preferences still keep counters and illustrations still.

In today mode, Bitcoin’s maximum and Bitcoin per person stay fixed for a visit. The browser captures the population estimate at page load for Bitcoin’s denominator and documents it in the sources modal. Each fiat share divides its own displayed amount by population at the same displayed model time, using unrounded estimates and rounding to whole native currency without accelerating tiny changes. Reduced motion starts with a still view of all fiat and population estimates and bills. Today’s range and expiry checks continue under reduced motion. Hidden pages stop timers and catch up from the actual clock when shown again. Without JavaScript, recorded monetary observations and July 1, 2026 population render with their equal shares. The sources modal reuses the disclosure’s live status elements, so opening it preserves the shared clock and Bitcoin’s visit share.

The keyboard-accessible **Previous year / Next year** controls sit above the World population readout on desktop and mobile, sharing the top row with the burger menu. Previous year and Next year use chevron buttons with accessible labels at every screen size. Today/future comparison context is inside the sources modal rather than beneath the controls. They advance from the shared clock’s current UTC calendar date to anniversaries up to **15 years ahead**. The current or future year appears as a larger year centered between equal-width button columns; conditional estimate context stays in the sources modal; future dates retain the shared clock’s **UTC time**, with February 29 clamped to February 28 in non-leap years. Future mode is a distinct **conditional scenario**, identified as estimates inside Sources & method. Each fiat continues its own historical **absolute annual stock addition linearly**, without compounding a percentage, from its recorded stock and anchor. Bitcoin remains at 21 million. Future counters and symbolic bills continue at each asset’s own pace; reduced motion freezes the shared clock in either mode, and hidden tabs stop timers until shown again. Future totals, population and both per-person amounts all refer to the selected date; both shares use the same unrounded population. Invalid/nonpositive totals or a date outside the population range show unavailable estimates, without substituting a recorded stock or endpoint denominator. This is an illustration of unchanged historical pace, not a prediction. Today’s independent asset expiry horizons and July 2025–July 2028 population range remain unchanged. Stepping back to the current year with Previous year restores the original Bitcoin visit share, checks expiry against the real clock, and preserves the selected asset.

Future population uses separate `population.scenarioPoints` from the **same official UN WPP 2024 Medium / World / both-sexes compact workbook**, sheet “Medium variant”, **column M, rows 19–36**, verified **October 12, 2026**. July 1 totals cover **2025 through 2042**, including the entire current fifteen-year range and its interpolation endpoints; source thousands are converted to people. The last two July 1 points are **2041 = 9,232,281,575** and **2042 = 9,286,110,371**. Adjacent totals use the existing interpolation with actual interval lengths. No demographic trend is extended beyond these sourced points.

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

The snapshot retains its legacy gold observations and model tests for source-maintenance compatibility. The comparison page does not serialize, render, select or animate gold; monetary refreshes preserve that unused data unchanged.

Population is reviewed **manually each year**, or when a new WPP revision is available. Download the linked workbook, select adjacent World / Medium / both-sexes July 1 totals, convert thousands to people, and update today’s bounded `points` and static fallback `persons`/`date` together. Also review `scenarioPoints`, keeping enough adjacent annual points to cover the current UTC date plus fifteen years (including the following July 1 when needed), and update population `checkedAt`. The fallback must match a bundled point. Keep revision, variant and source consistent, run the checks and rebuild. Monetary refreshes leave population untouched.

The static site has no live feed or background refresh service. Rebuild after updates; until then, old source dates remain visible and expired projections fall back to recorded data. Supply tests cover native scaling, independent rates/expiry/signs, leap days, population interpolation, shared controls, reduced motion, hidden tabs, fixed today-mode Bitcoin shares, fifteen-year scenarios, leap-day anniversaries, common future denominators, unavailable estimates, year controls, returning to the current year, and conservative refresh/import behavior.

Bitcoin amounts on this comparison use **whole satoshis exclusively**, including the static/no-JavaScript view: **2,100,000,000,000,000 sats** maximum, with 100,000,000 sats per BTC. The main totals have no supply-cap subtitle. Sources & method retains the selected fiat’s recorded/projected/scenario status, source dates and caveats; it explains Bitcoin’s 21 million consensus maximum and distinguishes it from circulating supply. Both Bitcoin amounts keep the ₿ prefix and display a smaller white “sats” label after the number. Hovering or focusing the label shows “A sat is the smallest unit of Bitcoin.” beside it, with no cursor change; Escape dismisses it. The tooltip switches sides to remain within the viewport. Bitcoin and the selected fiat use the same numeric font sizes for totals and per-person shares, with a compact heading-to-number gap in both sets of cards; the full sats total stays together while its unit label can wrap on narrow screens. Per-person sats convert the unrounded active share before display rounding (the fixed page-load population today, or the common scenario-time population in future mode). There is no BTC unit selector on this page; tracker and Earth controls are unchanged. Asset/year changes preserve the shared clock and reduced-motion behavior.

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
