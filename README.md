# Open Bitcoin Tracker — Website

[openbitcointracker.com](https://openbitcointracker.com): Bitcoin price tools, supply visualizations, and the [Android app](https://github.com/Max-Hodler/open-bitcoin-tracker). Built with Astro, TypeScript, Tailwind CSS, and React.

## Setup and checks

Requires **Node.js 22.12.0+** (`.nvmrc`: Node 22). No API keys.

```sh
npm ci
npm run dev
```

- `npm run build`: build to `dist/`; no full TypeScript check.
- `npm run check`: check TypeScript across source, scripts, and tests (excludes Astro templates).
- `npm run preview`: preview the build.
- `npm test`: chart, currency, preferences, browser, and supply tests.
- `npm run test:earth` and `npm run check:earth`: Earth tests and type checks.
- `npm run check:supply`: supply and refresh type checks.

## Project map

Routes: `/`, `/price-tracker/`, `/party-mode/`, `/video-mode/`, `/android-app/`, `/a-bit-of-earth/`, `/bitcoin-and-the-dollar/`, `/about/`, `/android-app/about/`, `/privacy/`. Money per Person is hidden from navigation pending further work.

`/about/` describes the whole project; `/android-app/about/` retains the app-specific creator, sources, and license information and is linked from the Android app page. Both About routes are translated into all supported languages, with matching navigation, language switching, metadata, and language redirects.

Pages live in `src/pages/` and `src/components/pages/`; shared UI in `src/components/`, `src/layouts/`, and `src/styles/`; browser logic in `src/lib/` and `src/scripts/`; Earth and supply in `src/features/`; static assets in `public/`.

Shared UI primitives live in `src/components/ui/`: native disclosure menus, currency option lists, icon buttons, and video cards. Theme and surface tokens belong in `src/styles/tokens.css`; keep visual variants in shared styles instead of copying a feature's CSS. `src/lib/disclosure-menu.ts`, `currency-picker.ts`, and `guide-drawer.ts` own keyboard, focus, and dismissal behavior. Astro and React guides both use the same drawer controller and styles; searchable country selection retains its combobox behavior. Party and Price on Video use `live-price-display.ts` for price formatting, FX state, preferences, and refresh lifecycle. Recent video cards clone the same server-rendered template used by suggestions.

Prices use Kraken and bundled Coin Metrics history; currency conversions use ECB reference rates through Frankfurter. Earth uses MapLibre and OpenFreeMap tiles, with fixed BTC presets and a bundled country selector centered on capital coordinates. Country filtering runs locally without a geocoder; keep map attribution visible. Supply definitions and official sources live in [snapshot.json](src/features/supply/snapshot.json).

## Maintenance

### Price on Video

Price on Video uses `/video-mode/` and its localized routes. Its page title, homepage heading, and menu label share `title` in `src/i18n/video.ts`; the homepage subtitle and page metadata share `description` there. Update that dictionary for every locale when changing the name or subtitle.

Tapping the video or price toggles the controls without changing playback. Revealed controls fade after three seconds of inactivity; playback uses the Play/Pause button. Entering fullscreen hides the controls immediately, and mouse movement does not reveal them there. Keyboard navigation and active editing keep controls accessible.

Edit the sections in `src/lib/video-suggestions.ts` to add or reorder curated videos in Price on Video. Party and Chill share the same selection and Recent-history behavior; adding a section also needs a translated tab label in `src/i18n/video.ts`. Each entry needs a YouTube video ID, its original title, and verified `isLive` and `isSilent` status; thumbnails use YouTube images, and selection uses the normal player and saved-video flow. Check the broadcast status rather than inferring it from the title or URL.

Recent videos stay in browser storage. Submitted URLs are saved immediately; suggestions join Recent when playback starts. Titles use the suggestion catalog when available; other titles come from YouTube's oEmbed endpoint and are cached alongside the saved URLs. Unavailable metadata does not prevent playback or removal.

Silent videos stay in Party and show a translated No sound badge in both suggestions and Recent.

Live badges start with the suggestion catalog or previously saved playback metadata. The player updates the selected video's status in both tabs and caches it for Recent; videos outside the catalog gain a badge once playback confirms they are live. Missing player metadata does not overwrite a known status.

### Price history

Synchronize `public/data/btc-history.csv` with the Android project's `assets/btc_history.csv`: `YYYY-MM-DD,USD_PRICE`, one daily point per line, no header. Preserve existing history and unavailable data; never invent prices across gaps.

Run `npm run refresh:prices` to append completed UTC days from the Coin Metrics Community API (`btc`, `PriceUSD`, daily). The refresh preserves existing rows and stops without writing if new observations are invalid, missing, unordered, or paginated. For a reviewed API response, use `npm run refresh:prices -- --file coinmetrics-response.json`. Review the appended dates/prices, synchronize the same CSV with Android, then run `npm test` and `npm run build`. Coin Metrics [Community data](https://coinmetrics.io/community-data/) is licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).

### Supply

```sh
npm run refresh:supply
npm run check:supply
npm test
npm run build
```

Refresh updates seasonally adjusted US M2 only. Use `-- --file downloaded-h6.html` for a downloaded official release, or `-- --import reviewed-money.json` for reviewed currency imports. Imports are JSON arrays matching [ReviewedMoneyImport](src/features/supply/refresh.ts), in **source units**. Verify series, definitions, adjustments, units, dates, and release vintage against official sources; validation cannot authenticate observations. Definition changes require model/metadata review. Failed refreshes preserve the snapshot.

Review population annually or after a UN WPP revision: World / Medium / both-sexes **Total Population, as of 1 July**, converting thousands to people. Update `points`, fallback `persons`/`date`, and `checkedAt` together. Keep `scenarioPoints` covering today's UTC date through 15 years ahead with adjacent interpolation endpoints, using one revision and source. Run the checks above and rebuild; monetary refreshes leave population untouched.

### Earth capital catalogue

`src/features/earth/lib/capitals.json` bundles capitals for the 193 UN member states, the two UN observer states, Kosovo and Taiwan. Multiple capitals and selected seats of government are included; Nauru uses Yaren. The list was reviewed on 2026-10-17. Names and country coverage derive from [mledoze/countries](https://github.com/mledoze/countries) (ODbL); most coordinates come from [Natural Earth Populated Places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/) (public domain). [GeoNames](https://www.geonames.org/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) supplies Yaren, Ngerulmud and Ciudad de la Paz coordinates. This adapted catalogue retains the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) database license; application code remains MIT.

Review capital changes and coordinates together before updating the catalogue. In particular, older source snapshots still list Bujumbura, Dar es Salaam, Melekeok, Nur-Sultan or Malabo; the bundled list uses Gitega, Dodoma, Ngerulmud, Astana and [Ciudad de la Paz](https://www.guineaecuatorialpress.com/noticias/el_presidente_de_la_republica_proclama_la_ciudad_de_la_paz_como_capital_de_la_republica_de_guinea_ecuatorial_con_la_firma_de_un_decreto_ley). Sri Jayawardenepura Kotte is included alongside Colombo; Jakarta remains listed while Nusantara's political-capital transition is planned for 2028. Source data is downloaded only for maintenance, never by visitors. After edits, run `npm run test:earth`, `npm run check:earth` and `npm run build`.

### Homepage previews

The homepage price card renders an all-time logarithmic SVG at build time from the bundled history. Its compact samples retain time-bucket highs/lows and segment endpoints; missing days remain separate paths. The browser receives these samples rather than the full CSV or interactive tracker. A small script polls the USD ticker once a minute and overlapping daily history every 15 minutes while the page is visible and online. Failed requests retain the dated price/curve and show unavailable status; a ticker cannot bridge missing daily history. The card links to the localized tracker.

The Price on Video card overlays the shared live Kraken BTC/USD feed on an animation. Each page load starts with the [fireplace](https://giphy.com/gifs/fireplace-cNZkqYmPeea1a); the Next animation control cycles through [Gandalf](https://tenor.com/view/gandalf-sax-guy-gif-18663354), [Kido](https://tenor.com/view/kido-gif-17366997422444245909), and back to the fireplace. The selection stays through pauses and browser-back restoration. Locally served, muted MP4s fill the card with centered cropping, without letterboxing. Only the chosen animation loads, and only once the card is visible and playing; reduced-motion preferences show its matching still poster until play is requested. Changing the animation preserves the paused state. The animation pauses offscreen and in background tabs and offers a play/pause control. Missing prices stay unavailable until a real quote arrives; interrupted connections retain the last quote with screen-reader connection status.

To add a background, convert its GIF to a silent H.264 MP4 with `yuv420p` and fast-start metadata in `public/`, export a matching WebP poster in `src/assets/previews/`, then add the pair and original source link to `src/lib/video-preview-backgrounds.ts`. Crop any black bars baked into the source before exporting both assets. Run `npm test` and `npm run build` and check the card at desktop and mobile widths.

The Earth captures live in `src/assets/previews/` and are optimized at build time. The card follows the selected light or dark theme and fills its image area with centered cropping. Recapture both themes when the tool's appearance changes; exclude browser chrome and development controls. Preview sources: Earth map © [OpenMapTiles](https://openmaptiles.org/) and © [OpenStreetMap](https://www.openstreetmap.org/copyright). Android uses the existing theme-aware app screenshots.

### Languages and social images

Keep all `src/i18n/` dictionaries consistent. English uses root URLs; Portuguese uses `/pt/` and dictionary code `pt-BR`. Earth controls, country search, map labels (where available), and guide content are translated through `earth.ts`; country names use the browser’s locale data. Supply content remains English.

Locale codes, URL segments, and autonyms live in `src/i18n/languages.ts`. Astro locales/sitemap, localized routes, layout alternates, the language switcher, and redirect middleware share that metadata. Adding a language requires an entry there, its dictionary and `ui.ts` registration, plus `tracker.ts`, `ranges.ts`, `chart-settings.ts`, `party.ts`, `video.ts`, and `earth.ts`. Social images use the registered dictionaries. Run `npm run check`, build, and review generated routes.

After social design or app-icon changes, run `npm run generate:social`, review `public/og-bitcoin-tools.png`, and rebuild. The social image uses the homepage paper background, app icon, and black product name in the bundled Barlow Condensed display font (`scripts/fonts/`, with its OFL license). Every locale uses the same brand image; generation needs no system fonts, and normal builds use checked-in images. Bump the image URL version in `src/layouts/Layout.astro` when replacing the cards. `public/og-image.png` remains a compatibility copy.

## Deployment

Cloudflare Pages: `npm run build`, output `dist/`, include `functions/`. Language redirects use the saved cookie or browser language; development and preview do not run the function. Configure runtime in `wrangler.toml`, site URL/locales/sitemap in `astro.config.mjs`. Forks must also review `public/robots.txt` and project/download links.

[MIT](LICENSE) for application code; see the Earth catalogue attribution above for data licensing. Preserve font licenses in `public/fonts/` and `public/earth/fonts/`.
