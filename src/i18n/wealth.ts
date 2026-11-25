// This feature intentionally uses English on every localized route.
export const wealth = {
  title: 'Global Wealth',
  description: 'Bitcoin next to the world’s largest stores of value. Move the slider to see what one bitcoin would be worth if it drew value from everything else.',
  treemapLabel: 'Global wealth by asset, each box sized by value',
  priceLabel: 'Price per bitcoin',
  sliderValue: '{price} per bitcoin, {cap} market cap',
  priceUnavailable: 'Live Bitcoin price unavailable. Showing the last known price from {date}.',
  goldUnavailable: 'Live gold price unavailable. Showing the price from {date}.',
  nojs: 'Without JavaScript, the chart shows values from {date}. The live prices and the slider require JavaScript.',
  methodTitle: 'Sources',
  closeMethod: 'Close sources',
  // Each source below says how its value is priced; this note covers what none of them do.
  methodNote: 'Categories overlap, so read the total as an order of magnitude. Moving the slider takes Bitcoin’s gain from the other assets in proportion to their size, so the total stays fixed.',
  bitcoinMethod: 'Circulating supply from the subsidy schedule, estimated from block {height} ({date}). Lost coins included.',
  goldMethod: '{tonnes} tonnes above ground (end of {year}) × the live PAXG price.',
  silverMethod: '{ounces} billion ounces above ground (end of {year}) × ${price}/oz ({date}). Bullion plus recoverable silverware and jewelry; silver used up in industry is excluded.',
  fiatMethod: 'Broad money in {count} currencies at ECB rates of {date}: M2 (M4ex for the UK) for USD, EUR, JPY, CNY and GBP, plus each central bank’s headline measure for the rest.',
  ownRateMethod: 'The ECB does not quote {currencies}, so those use their own central bank’s rate for the same day.',
  otherMoneyLabel: 'Other currencies:',
  ownRateLabel: 'Central bank rates:',
  asOf: 'as of {date}',
  sourceLink: 'Source',
};

export const assetNames = {
  realEstate: 'Real estate',
  bonds: 'Bonds',
  equities: 'Equities',
  fiat: 'Fiat',
  gold: 'Gold',
  silver: 'Silver',
  bitcoin: 'Bitcoin',
} as const;

export type WealthCopy = typeof wealth;
