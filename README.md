<div align="center">

<picture>
  <img src="./public/app-icon.png" width="128px" alt="Open Bitcoin Tracker icon">
</picture>

</div>

<h1 align="center">Open Bitcoin Tracker — Website</h1>

<p align="center">
  A live Bitcoin price chart and Bitcoin tools, including <a href="https://github.com/Max-Hodler/open-bitcoin-tracker">Open Bitcoin Tracker</a> — an open-source Bitcoin portfolio tracker for Android.
</p>

<div align="center">

[![Astro](https://img.shields.io/badge/Astro-6-FF5D01?style=for-the-badge&logo=astro&logoColor=white)](https://astro.build)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-success?style=for-the-badge)](./LICENSE)

</div>

The homepage shows the full daily BTC/USD history since July 2010, using the Android app's logarithmic chart, orange line, gradient, and Paper Cream / Deepsea Blue colours. Kraken's public WebSocket ticker supplies the live price; REST polling provides a fallback while reconnecting. Recent daily Kraken candles are merged into the bundled history by UTC day.

The range bar overlays the lower part of the chart and mirrors the app's days, weeks, months, years, and All slots. Select a slot, then use its up/down chevrons (or the up/down arrow keys on its label) to cycle through 1–7 days, 1–4 weeks, 1–12 months, or 1–15 years. Each slot keeps its count while switching ranges. The matching button to the right toggles between logarithmic (Log) and linear (Lin) scales; logarithmic is the default, and the selected scale stays active when changing ranges. Days use 15-minute Kraken candles; weeks and one month use hourly candles; longer ranges use the daily history. Intraday requests are cached by interval and refreshed every minute while selected.

Below the live price, the selected range's signed dollar change and percentage use the first and last plotted prices, including the live price when it connects to the chart. The subtitle matches the Android app's whole-dollar amounts and compact percentages, and stays blank until at least two prices are available.

Press and drag on the chart to scrub through prices. A dashed vertical marker and dot snap to the nearest recorded point, while the top-left price and subtitle show that point's price and date (or time for intraday ranges). Moving the mouse without pressing leaves the chart and live price unchanged. Live updates continue in the background. Releasing the mouse or ending a touch gesture, or changing ranges, restores the live price and range change. The focused chart also supports Left/Right, Home/End, and Escape.

The existing Android app landing page lives at `/android-app/`. Both pages are available in all ten supported languages.

Run `npm install` and `npm run dev` for a local preview, or `npm run build` for the static production output.

`public/data/btc-history.csv` is copied from the Android project's `assets/btc_history.csv` (Coin Metrics history). Keep this asset updated alongside the app: Kraken only supplies the most recent 720 daily candles. The chart retains its bundled history and reports unavailable recent data if a request fails or the data sources no longer overlap. The live price remains separate from the historical chart's last available date.
