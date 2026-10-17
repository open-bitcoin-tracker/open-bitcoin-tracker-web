import type { HistoryPoint } from './bitcoin-chart';

// Match the Android subtitle: whole currency units, compact large percentages,
// and enough decimal places to keep a small percentage change visible.
export function createPriceChangeFormatter(locale: string, currency = 'USD') {
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
  const number = (value: number, decimals = 0) => new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(value);

  return (points: HistoryPoint[]): string => {
    if (points.length < 2) return '';
    const first = points[0].price;
    const last = points.at(-1)!.price;
    if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(last) || last <= 0) return '';
    const difference = last - first;
    const percentage = difference / first * 100;
    if (!Number.isFinite(percentage)) return '';
    const absolute = Math.abs(percentage);
    let percentText: string;
    if (absolute >= 1_000_000) percentText = `${number(Math.round(absolute / 1_000_000))}M`;
    else if (absolute >= 1_000) percentText = `${number(Math.round(absolute / 1_000))}K`;
    else if (absolute >= .5) percentText = number(Math.round(absolute));
    else {
      let decimals = 1;
      while (decimals < 8 && absolute > 0 && Math.round(absolute * 10 ** decimals) === 0) decimals++;
      percentText = number(absolute, decimals);
    }
    const sign = difference < 0 ? '-' : '+';
    return `${sign}${money.format(Math.abs(difference))} (${sign}${percentText}%)`;
  };
}
