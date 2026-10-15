# Open Bitcoin Tracker — Website

[openbitcointracker.com](https://openbitcointracker.com) hosts a Bitcoin price tracker, Party Mode, Video Mode, the [Android app](https://github.com/Max-Hodler/open-bitcoin-tracker) overview, and two supply visualizations. Built with Astro 6, TypeScript, Tailwind CSS 4, and React for the Earth map; deployed as static pages with a Cloudflare Pages Function for language redirects.

## Development

Use Node.js **22.12.0 or newer** (`.nvmrc` selects Node 22). No API keys are required.

```sh
npm ci
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm test` | Chart, currency, preferences, supply model/browser, and refresh tests |
| `npm run test:earth` | Earth map, calculation, preferences, and theme tests |
| `npm run check:earth` | Type-check the Earth feature and tests |
| `npm run check:supply` | Type-check the supply feature, browser script, refresh script, and tests |
| `npm run refresh:supply` | Refresh US M2 from the official Federal Reserve H.6 release |
| `npm run build` | Generate the production site in `dist/` |
| `npm run preview` | Serve the built site locally |

The build does **not** perform a full TypeScript check. Development and preview do not run the Pages Function.

## Routes and languages

| Route | Content |
| --- | --- |
| `/` | Project landing page |
| `/price-tracker/` | Live price and interactive history since July 2010 |
| `/party-mode/` | Full-screen live price, local music playlist, and reactive orange visualizer |
| `/video-mode/` | Full-screen live price over a YouTube video chosen by URL |
| `/android-app/` | Android app overview and downloads |
| `/a-bit-of-earth/` | Bitcoin amounts expressed as shares of Earth's land |
| `/bitcoin-and-the-dollar/` | Money per Person: Bitcoin and five fiat money supplies |
| `/about/`, `/privacy/` | Project information and Android app privacy policy |

Every route exists in English, Spanish, Brazilian Portuguese, Russian, Turkish, Vietnamese, Japanese, French, German, and Italian. English has no prefix; Portuguese uses `/pt/` with dictionary code `pt-BR`; others use their language code. Earth and Money per Person feature content remains English; their navigation and landing descriptions are localized.

On Cloudflare Pages, visits to any unprefixed page honor a valid `lang` cookie or detect the browser’s `Accept-Language`, remembering the result for 180 days. Unsupported languages fall back to English. Explicit localized URLs keep their language; the language switcher links to the same page and saves manual choices (including English) when JavaScript and cookies are available. Redirects preserve query strings. Language negotiation requires the Pages Function; Astro development and preview serve the URL’s language directly.

The site selects light or dark mode before the first paint from the browser/device preference and follows system changes while no manual choice is saved. The theme toggle overrides the system and persists in local storage when available. Blocked storage still allows system detection and a manual choice for the current page; changes in other tabs synchronize the theme.

## Data and behavior

### Price tracker

Kraken supplies live BTC/USD via WebSocket, with REST polling every 30 seconds when the stream is unavailable. Selected intraday candles refresh every minute; daily history refreshes every 15 minutes and merges with bundled Coin Metrics data by UTC day. Kraken's candle limit can shorten intraday ranges. Streams, timers, and rendering pause in hidden tabs and refresh on return.

USD is the default; EUR, GBP, AUD, CAD, CHF, and JPY convert the USD series using daily ECB reference rates through Frankfurter's v2 ECB endpoint. These are reference conversions, not live exchange quotes. Historical points use the latest rate on or before their UTC date, carried forward at most seven days. Missing rates show unavailable data.

Range, logarithmic/linear scale, and currency preferences persist in local storage. Drag to inspect prices, or focus the chart and use Left/Right, Home/End, and Escape. Drag the selected range pill horizontally to switch units; swipe it up/down to increase/decrease its count, wrapping at either end like the Android app. Range counts also use chevrons or Up/Down keys. Motion respects reduced-motion preferences. A bundled chart renders without JavaScript; live prices and controls require it.

### Party Mode

Party Mode shares the price tracker's Kraken live feed and ECB currency conversion, with a large centered price over an orange canvas visualizer that fills the screen. Currency preferences are shared with the price tracker.

Select one or more local audio files to create a playlist in the order supplied by the browser's `FileList`. The file picker is replaced by play/pause and previous/next buttons; track navigation appears only for a playlist. During playback on devices with a mouse, play/pause fades after 2.5 seconds of pointer inactivity and returns on movement or interaction. Keyboard focus keeps it visible; touch controls stay visible. Playback advances automatically to the next track and stops after the final track. Supported formats and codecs vary by browser.

Audio stays on the device: files and filenames are not uploaded, logged, or saved in storage. A Web Audio analyser provides frequency and volume data; bass hits and sudden changes in audio energy drive the orange pulses. The visualizer stays still before playback, when music is paused or stopped, and when reduced-motion preferences are enabled. Hidden tabs pause the canvas and live feed while audio can continue. Leaving the page stops playback, revokes file object URLs, and releases audio resources.

Fullscreen is available where the browser supports it; live prices, local music playback, and the visualizer require JavaScript.

### Video Mode

Video Mode shares the price tracker's Kraken live feed, ECB currency conversion, and currency preference. Submit a YouTube video URL to play it behind the live price, filling the page. Sound is enabled by default; controls allow play/pause, volume, mute, changing the video, and browser fullscreen where supported. If the browser blocks autoplay, press Play to start the video. The progress bar shows the current position and duration; drag it or use its keyboard controls to seek when the video supports seeking. Subtitles can be toggled when YouTube provides them for the selected video. Looping is off by default; enable it to restart from the beginning when the video ends. Videos that disallow embedding or are otherwise unavailable show an error so another video can be selected.

Drag the price to move it. Clicking or dragging reveals a frame with four corner handles for resizing; the frame fades after interaction stops. A hint appears below the default price and disappears when its layout changes. Reset price position appears beside the currency picker for a modified layout and restores the centered position and original size. With the price focused, arrow keys move it (Shift makes larger steps), +/− resize it, and Home also resets the layout. Escape hides the frame. The price stays within the viewport as its value, currency, or screen size changes. Currency, position, and size are saved locally and restored on the next visit; layout settings are separate from chart preferences.

The Aa button beside the currency picker opens price styling: choose a colour swatch or any custom colour, select a modern, condensed, serif, or monospace font, or reset the style. Changes preview immediately; colour and font are saved locally independently of price position and size.

Volume, mute, subtitles, and loop preferences are saved locally and restored on the next visit. The subtitle preference is retained even when a video has no captions. When subtitles are enabled, the player fits the viewport to keep native YouTube captions readable; the background returns to filling the viewport when subtitles are off.

On desktop, all controls and the cursor hide after 2.5 seconds of mouse inactivity, leaving only the price and background video. Mouse movement or keyboard input reveals them again. Controls stay visible while editing a link, using an open menu, or navigating with keyboard focus; touch devices keep them visible.

The selected video is saved locally as a validated URL without share-tracking parameters and restored automatically on the next visit. YouTube is contacted after a link is submitted or a saved video is restored. Playback uses YouTube's privacy-enhanced embed domain and IFrame Player API; YouTube's own service policies apply. Hidden tabs pause the video and live price feed; returning refreshes the price and requires a deliberate play action to resume the video. New page loads attempt playback of the restored selection, including with reduced motion enabled; if the browser blocks autoplay, press Play. Live prices and YouTube playback require JavaScript.

### A Bit of Earth

Adapted from [bitcoin-land](https://github.com/Max-Hodler/bitcoin-land), the browser-only React calculator maps `BTC / 21,000,000 × 148,940,000 km²` using MapLibre GL. JavaScript is required; amount calculations stay local.

Location search sends submitted queries to Photon (`https://photon.komoot.io/api/`); override it at build time with `PUBLIC_EARTH_GEOCODER_URL` for a compatible service. Tiles and glyphs come from providers in `src/features/earth/map/style.json`. Keep attribution visible. The page suppresses referrer headers and follows the shared site theme.

### Money per Person

Bitcoin's consensus maximum of 21 million BTC is displayed in whole satoshis alongside USD, EUR, JPY, CNY, or GBP (default: USD), with equal per-person shares. Official observations, definitions, units, release dates, and source links live in [`snapshot.json`](src/features/supply/snapshot.json); the page's Sources & method panel explains the model.

- Each fiat uses its own year-over-year absolute stock change divided by actual elapsed seconds. Projections start at 00:00 UTC on the first day after the observation month, expire independently after 90 days, and return to recorded data. Negative rates remain negative.
- Population interpolates adjacent UN WPP 2024 Medium / World / both-sexes July 1 totals. Today's model uses bounded `population.points`, falling back to the nearest endpoint outside that range. Today's Bitcoin share fixes its population denominator at page load; fiat shares use the displayed model time.
- Year controls show conditional scenarios up to 15 years ahead. Fiat stocks continue their historical absolute pace without compounding or today's expiry limit. Both shares use population at the selected date from separate `scenarioPoints`; invalid totals or dates outside those points show unavailable estimates.

These are illustrative estimates, not live issuance, forecasts, purchasing-power comparisons, or actual wealth distribution. Broad-money definitions differ: USD/EUR/JPY/CNY use M2; GBP uses M4ex. Stock differences can include revisions, valuation changes, and statistical breaks.

Reduced motion keeps estimates and illustrations still; hidden tabs stop timers. Without JavaScript, the default comparison uses recorded US M2 and the bundled population fallback. There is no background data refresh: snapshot changes require a rebuild.

## Maintenance

### Price history

Keep `public/data/btc-history.csv` synchronized with the Android project's `assets/btc_history.csv`: `YYYY-MM-DD,USD_PRICE`, one daily point per line, no header. Preserve existing data and unavailable states when recent candles cannot connect without gaps; never invent prices.

### Supply snapshot

```sh
npm run refresh:supply
npm run check:supply
npm test
npm run build
```

The refresh updates only seasonally adjusted US M2 from H.6. It requires the same-month point one year earlier, rejects older releases, and validates before atomically replacing the snapshot. Download, parsing, or validation failures preserve the existing file. To use a downloaded official release, run `npm run refresh:supply -- --file downloaded-h6.html`.

For other currencies, review the official sources linked in the snapshot and import a JSON array with `npm run refresh:supply -- --import reviewed-money.json`. Each entry follows [`ReviewedMoneyImport`](src/features/supply/refresh.ts): `id`, `sourceMultiplier`, `latest` and `previousYear` (`month`, `value`), `releasedAt`, `source`, `dataSource`, `previousDataSource`, `definitionSource`, and `note`. Values must be in **source units**, not already scaled native units. Verify the series, adjustment, dates, units, and historical release vintage. Imports preserve series metadata and validate the whole bundle; validation does not authenticate observations. A definition change requires a reviewed model/metadata update.

Review population annually or after a new WPP revision. Use the linked compact workbook's World / Medium / both-sexes **Total Population, as of 1 July** (column M in the current revision), converting thousands to people. Update `points`, the matching fallback `persons`/`date`, and `checkedAt` together. Keep `scenarioPoints` wide enough for today's UTC date plus 15 years and its adjacent interpolation endpoints. Use one consistent revision and source; run the supply checks and rebuild. Monetary refreshes leave population untouched.

### Source layout

| Location | Purpose |
| --- | --- |
| `src/pages/`, `src/components/pages/` | Routes and shared page content |
| `src/components/`, `src/layouts/`, `src/styles/` | UI, metadata, and styles |
| `src/lib/`, `src/scripts/`, `tests/` | Chart logic, browser interactions, and Node tests |
| `src/features/earth/`, `public/earth/` | Earth feature, tests, and assets |
| `src/features/supply/`, `scripts/refresh-supply.ts` | Supply snapshot, model, and refresh/import logic |
| `src/i18n/` | Page dictionaries, chart, Party Mode, and Video Mode copy, and English supply copy |
| `src/assets/screenshots/` | App screenshots, converted to responsive WebP at build time |

To add a language, update the dictionary and registration in `src/i18n/ui.ts`; `tracker.ts`, `ranges.ts`, `chart-settings.ts`, `party.ts`, and `video.ts`; every `src/pages/[lang]/` route's `getStaticPaths()`; Astro locales and sitemap configuration; layout alternates; switcher entries; and middleware matchers. Build and review the generated routes. Earth and supply need separate feature translation work.

## Deployment

For Cloudflare Pages, build with `npm run build`, serve `dist/`, and include `functions/`. `wrangler.toml` defines the output directory and runtime compatibility date; `astro.config.mjs` defines the canonical site URL, locales, and sitemap. Custom domains or forks must also update `public/robots.txt` and the site's project/download links as needed.

Licensed under [MIT](LICENSE). Preserve bundled font licenses in `public/fonts/` and `public/earth/fonts/`.
