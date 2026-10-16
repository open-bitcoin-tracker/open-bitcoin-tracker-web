# Open Bitcoin Tracker — Website

[openbitcointracker.com](https://openbitcointracker.com): Bitcoin price tools, supply visualizations, and the [Android app](https://github.com/Max-Hodler/open-bitcoin-tracker). Built with Astro, TypeScript, Tailwind CSS, and React.

## Setup and checks

Requires **Node.js 22.12.0+** (`.nvmrc`: Node 22). No API keys.

```sh
npm ci
npm run dev
```

- `npm run build`: build to `dist/`; no full TypeScript check.
- `npm run preview`: preview the build.
- `npm test`: chart, currency, preferences, browser, and supply tests.
- `npm run test:earth` and `npm run check:earth`: Earth tests and type checks.
- `npm run check:supply`: supply and refresh type checks.

## Project map

Routes: `/`, `/price-tracker/`, `/party-mode/`, `/video-mode/`, `/android-app/`, `/a-bit-of-earth/`, `/bitcoin-and-the-dollar/`, `/about/`, `/privacy/`. Money per Person is hidden from navigation pending further work.

Pages live in `src/pages/` and `src/components/pages/`; shared UI in `src/components/`, `src/layouts/`, and `src/styles/`; browser logic in `src/lib/` and `src/scripts/`; Earth and supply in `src/features/`; static assets in `public/`.

Prices use Kraken and bundled Coin Metrics history; currency conversions use ECB reference rates through Frankfurter. Earth uses MapLibre and Photon search (`PUBLIC_EARTH_GEOCODER_URL` overrides the geocoder); keep map attribution visible. Supply definitions and official sources live in [snapshot.json](src/features/supply/snapshot.json).

## Maintenance

### Video picker sections

Edit the sections in `src/lib/video-suggestions.ts` to add or reorder curated Video Mode videos. Party, Chill, and No Sound share the same selection and Recent-history behavior; adding a section also needs a translated tab label in `src/i18n/video.ts`. Each entry needs a YouTube video ID, its original title, and verified `isLive` status; thumbnails use YouTube images, and selection uses the normal player and saved-video flow. Check the broadcast status rather than inferring it from the title or URL.

Recent videos stay in browser storage. Submitted URLs are saved immediately; suggestions join Recent when playback starts. Titles use the suggestion catalog when available; other titles come from YouTube's oEmbed endpoint and are cached alongside the saved URLs. Unavailable metadata does not prevent playback or removal.

Live badges start with the suggestion catalog or previously saved playback metadata. The player updates the selected video's status in both tabs and caches it for Recent; videos outside the catalog gain a badge once playback confirms they are live. Missing player metadata does not overwrite a known status.

### Price history

Synchronize `public/data/btc-history.csv` with the Android project's `assets/btc_history.csv`: `YYYY-MM-DD,USD_PRICE`, one daily point per line, no header. Preserve existing history and unavailable data; never invent prices across gaps.

### Supply

```sh
npm run refresh:supply
npm run check:supply
npm test
npm run build
```

Refresh updates seasonally adjusted US M2 only. Use `-- --file downloaded-h6.html` for a downloaded official release, or `-- --import reviewed-money.json` for reviewed currency imports. Imports are JSON arrays matching [ReviewedMoneyImport](src/features/supply/refresh.ts), in **source units**. Verify series, definitions, adjustments, units, dates, and release vintage against official sources; validation cannot authenticate observations. Definition changes require model/metadata review. Failed refreshes preserve the snapshot.

Review population annually or after a UN WPP revision: World / Medium / both-sexes **Total Population, as of 1 July**, converting thousands to people. Update `points`, fallback `persons`/`date`, and `checkedAt` together. Keep `scenarioPoints` covering today's UTC date through 15 years ahead with adjacent interpolation endpoints, using one revision and source. Run the checks above and rebuild; monetary refreshes leave population untouched.

### Languages and social images

Keep all `src/i18n/` dictionaries consistent. English uses root URLs; Portuguese uses `/pt/` and dictionary code `pt-BR`. Earth and supply content remains English.

Adding a language requires its dictionary and `ui.ts` registration; `tracker.ts`, `ranges.ts`, `chart-settings.ts`, `party.ts`, and `video.ts`; every `src/pages/[lang]/` route's `getStaticPaths()`; Astro locales/sitemap, layout alternates, switcher entries, middleware matchers, and `scripts/generate-social-images.ts`. Build and review generated routes.

After social copy or tool-label changes, run `npm run generate:social`, review all `public/og-bitcoin-tools*.png`, and rebuild. Generation requires **Noto Sans** and **Noto Sans CJK JP**; normal builds use checked-in images.

## Deployment

Cloudflare Pages: `npm run build`, output `dist/`, include `functions/`. Language redirects use the saved cookie or browser language; development and preview do not run the function. Configure runtime in `wrangler.toml`, site URL/locales/sitemap in `astro.config.mjs`. Forks must also review `public/robots.txt` and project/download links.

[MIT](LICENSE). Preserve font licenses in `public/fonts/` and `public/earth/fonts/`.
