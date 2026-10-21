import { CurrencyRates, isCurrency, type Currency } from './bitcoin-currency';
import { readDisplayPreferences, saveDisplayPreferences, subscribeCurrencyPreference } from './bitcoin-display-preferences';
import { subscribeBitcoinPrice, type PriceFeedState } from './bitcoin-live-price';
import type { HistoryPoint } from './bitcoin-chart';
import type { PartyCopy } from '../i18n/party';

type PriceCopy = Pick<PartyCopy, 'unavailable' | 'offline' | 'fxLoading' | 'fxUnavailable' | 'loadingPrice' | PriceFeedState>;

/** Shared live-price presentation; charts retain their separate history/selection model. */
export function createLivePriceDisplay(root: HTMLElement, { copy: t, locale, onPaint }: {
  copy: PriceCopy;
  locale: string;
  onPaint?: (currency: Currency) => void;
}) {
  const price = root.querySelector<HTMLElement>('[data-price]')!;
  const status = root.querySelector<HTMLElement>('[data-price-status]')!;
  const currencySelect = root.querySelector<HTMLSelectElement>('[data-currency]')!;
  const rates = new CurrencyRates();
  let currency: Currency = readDisplayPreferences().currency;
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
    const value = livePoint && rate ? money.format(livePoint.price * rate.rate) : '—';
    price.textContent = value;
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
