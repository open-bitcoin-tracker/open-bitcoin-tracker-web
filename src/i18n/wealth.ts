// This feature intentionally uses English on every localized route.
export const wealth = {
  title: 'Global Wealth',
  description: 'Bitcoin next to the world’s largest stores of value. Move the slider to see what one bitcoin would be worth if it drew value from everything else.',
  treemapLabel: 'Global wealth by asset, each box sized by value',
  simulatorTitle: 'Bitcoin market cap simulator',
  priceLabel: 'Price per bitcoin',
  sourceLabel: 'Value taken from',
  allAssets: 'All assets',
  presetsLabel: 'Make Bitcoin as big as',
  sliderValue: '{price} per bitcoin, {cap} market cap',
  priceUnavailable: 'Live Bitcoin price unavailable. Showing the last known price from {date}.',
  goldUnavailable: 'Live gold price unavailable. Showing the price from {date}.',
  nojs: 'Without JavaScript, the chart shows values from {date}. The live prices and the slider require JavaScript.',
  methodTitle: 'Sources & method',
  methodIntro: 'Bitcoin and gold are priced live; the rest come from annual reports. Categories overlap, so read the total as an order of magnitude.',
  simulationMethod: 'Bitcoin’s gain comes from the other assets in proportion to their size, or from one chosen asset; the total stays fixed. Price = market cap ÷ circulating supply.',
  bitcoinMethod: 'Circulating supply from the subsidy schedule, estimated from block {height} ({date}). Lost coins included.',
  goldMethod: '{tonnes} tonnes above ground (end of {year}) × the live PAXG price.',
  fiatMethod: 'M2 (M4ex for the UK) in USD, EUR, JPY, CNY and GBP, at ECB rates of {date}.',
  asOf: 'as of {date}',
  sourceLink: 'Source',
};

export const assetNames = {
  realEstate: 'Real estate',
  bonds: 'Bonds',
  equities: 'Equities',
  fiat: 'Fiat',
  gold: 'Gold',
  bitcoin: 'Bitcoin',
} as const;

export type WealthCopy = typeof wealth;
