import { CurrencyRates, isCurrency, type Currency } from './bitcoin-currency';
import { readDisplayPreferences, saveDisplayPreferences, subscribeCurrencyPreference } from './bitcoin-display-preferences';
import { subscribeBitcoinPrice, type PriceFeedState } from './bitcoin-live-price';
import type { HistoryPoint } from './bitcoin-chart';
import type { PartyCopy } from '../i18n/party';
import { createRollingNumber } from './rolling-number';

type PriceCopy = Pick<PartyCopy, 'unavailable' | 'offline' | 'fxLoading' | 'fxUnavailable' | 'loadingPrice' | PriceFeedState>;

/** Shared live-price presentation; charts retain their separate history/selection model. */
export function createLivePriceDisplay(root: HTMLElement, { copy: t, locale, onPaint, initialCurrency }: {
  copy: PriceCopy;
  locale: string;
  onPaint?: (currency: Currency) => void;
  initialCurrency?: Currency;
}) {
  const price = root.querySelector<HTMLElement>('[data-price]')!;
  // Pages that include a rolling layer inside the price get the app's rolling digits; the real text
  // stays underneath (transparent) for layout, accessibility, and effects such as shadows.
  const roller = createRollingNumber(price.querySelector?.<HTMLElement>('[data-price-roll]') ?? null);
  const priceText = (roller && price.querySelector<HTMLElement>('[data-price-text]')) || price;
  if (roller && priceText !== price) price.setAttribute('data-price-rolling', '');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let lastLive: { value: number; currency: Currency } | undefined;
  let rollDirection = 1;
  let rolledText: string | undefined;
  const status = root.querySelector<HTMLElement>('[data-price-status]')!;
  const currencySelect = root.querySelector<HTMLSelectElement>('[data-currency]')!;
  const rates = new CurrencyRates();
  let currency: Currency = initialCurrency ?? readDisplayPreferences().currency;
  const formatMoney = () => new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', useGrouping: true, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  let money = formatMoney();
  let livePoint: HistoryPoint | undefined;
  let state: PriceFeedState = 'connecting';
  let loadingRates = false;
  let destroyed = false;
  let rateRefresh: ReturnType<typeof setInterval> | undefined;
  let rateRequest: Promise<void> | undefined;

  function paintPrice() {
    if (destroyed || document.hidden) return;
    const rate = rates.current(currency);
    const live = livePoint && rate ? livePoint.price * rate.rate : undefined;
    const value = live !== undefined ? money.format(live) : '—';
    priceText.textContent = value;
    if (roller && priceText !== price && value !== rolledText) {
      rolledText = value;
      // Live ticks roll in the price's direction; the first price and currency changes snap.
      // A page can switch rolling off (Price on Video's style setting); hidden layers then snap.
      const animate = live !== undefined && lastLive?.currency === currency && !reduceMotion?.matches && !price.closest?.('[data-price-static]');
      if (live !== undefined && lastLive && live !== lastLive.value) rollDirection = live > lastLive.value ? 1 : -1;
      lastLive = live === undefined ? undefined : { value: live, currency };
      roller.set(value, { direction: rollDirection, animate });
    }
    price.style.setProperty('--price-chars', String([...value].length));
    if (livePoint && rate) price.removeAttribute('aria-label');
    else price.setAttribute('aria-label', t.unavailable);
    // Never label a cached price as live while its feed or FX is unavailable.
    status.textContent = !navigator.onLine || state === 'offline' ? t.offline
      : currency !== 'USD' && !rate ? (loadingRates ? t.fxLoading : t.fxUnavailable)
      : !livePoint ? (state === 'connecting' ? t.loadingPrice : t.unavailable)
      : t[state];
    onPaint?.(currency);
  }

  async function refreshRates() {
    if (destroyed || document.hidden || currency === 'USD' || !navigator.onLine) { paintPrice(); return; }
    if (rateRequest) { await rateRequest; paintPrice(); return; }
    loadingRates = true;
    paintPrice();
    rateRequest = rates.refreshLatest().catch(() => {
      // An expired or unavailable rate stays unavailable; never guess a value.
    }).finally(() => { loadingRates = false; rateRequest = undefined; });
    await rateRequest;
    paintPrice();
  }

  currencySelect.value = currency;
  currencySelect.disabled = false;
  const applyCurrency = (next: Currency) => {
    currency = next;
    currencySelect.value = next;
    money = formatMoney();
    paintPrice();
    void refreshRates();
  };
  const onCurrencyChange = () => {
    if (!isCurrency(currencySelect.value) || currencySelect.value === currency) return;
    applyCurrency(currencySelect.value);
    saveDisplayPreferences({ ...readDisplayPreferences(), currency });
  };
  currencySelect.addEventListener('change', onCurrencyChange);
  const stopCurrency = subscribeCurrencyPreference(next => {
    if (next === currency) return;
    applyCurrency(next);
    currencySelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const stopPrice = subscribeBitcoinPrice({
    onPrice(point) { livePoint = point; paintPrice(); },
    onState(value) { state = value; paintPrice(); },
  });

  function onVisibility() {
    if (rateRefresh !== undefined) clearInterval(rateRefresh);
    rateRefresh = undefined;
    if (!destroyed && !document.hidden) {
      void refreshRates();
      rateRefresh = setInterval(() => { void refreshRates(); }, 60_000);
      paintPrice();
    }
  }
  const onOnline = () => { void refreshRates(); };
  let started = false;
  return {
    start() {
      if (started || destroyed) return;
      started = true;
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('online', onOnline);
      onVisibility();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopCurrency();
      stopPrice();
      if (rateRefresh !== undefined) clearInterval(rateRefresh);
      currencySelect.removeEventListener('change', onCurrencyChange);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    },
  };
}
