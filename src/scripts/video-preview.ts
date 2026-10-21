import { subscribeBitcoinPrice, type PriceFeedState } from '../lib/bitcoin-live-price';
import type { HistoryPoint } from '../lib/bitcoin-chart';
import { CurrencyRates } from '../lib/bitcoin-currency';
import { readDisplayPreferences, subscribeCurrencyPreference } from '../lib/bitcoin-display-preferences';

export function startVideoPreview(root: HTMLElement) {
  const copy: Record<string, string> = JSON.parse(root.dataset.copy!);
  const locale = root.dataset.locale || 'en';
  const price = root.querySelector<HTMLElement>('[data-video-price]')!;
  const status = root.querySelector<HTMLElement>('[data-video-price-status]')!;
  const video = root.querySelector<HTMLVideoElement>('[data-preview-video]')!;
  const backgrounds: { src: string; poster: string }[] = JSON.parse(root.dataset.backgrounds!);
  let backgroundIndex = 0;
  let background = backgrounds[backgroundIndex];
  video.poster = background.poster;
  const toggle = root.querySelector<HTMLButtonElement>('[data-preview-motion]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-preview-next]')!;
  const playIcon = toggle.querySelector<SVGElement>('[data-motion-play]')!;
  const pauseIcon = toggle.querySelector<SVGElement>('[data-motion-pause]')!;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let currency = readDisplayPreferences().currency;
  const rates = new CurrencyRates();
  const formatMoney = () => new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
  let money = formatMoney();
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  let point: HistoryPoint | undefined;
  let state: PriceFeedState = 'connecting';
  let visible = false;
  let paused = motion.matches;
  let suspended = false;
  let stopped = false;
  let stopPrice: (() => void) | undefined;
  let rateTimer: ReturnType<typeof setInterval> | undefined;
  let rateRequest: Promise<void> | undefined;

  function paintPrice() {
    if (stopped || suspended || document.hidden) return;
    const rate = rates.current(currency);
    if (point && rate) {
      const formatted = money.format(point.price * rate.rate);
      price.textContent = formatted;
      price.title = `${copy.updated}: ${date.format(point.time)}`;
      price.setAttribute('aria-label', `${copy.price}: ${formatted} ${currency}. ${price.title}`);
    } else {
      price.textContent = '—';
      price.title = '';
      price.setAttribute('aria-label', copy.unavailable);
    }
    status.textContent = !navigator.onLine ? copy.offline : !rate ? copy.unavailable : (point || state === 'connecting') ? copy[state] : copy.unavailable;
  }

  async function refreshRates() {
    if (stopped || suspended || !visible || document.hidden || !navigator.onLine || currency === 'USD') return;
    rateRequest ??= rates.refreshLatest().catch(() => {
      // Missing FX stays unavailable until a real rate arrives.
    }).finally(() => { rateRequest = undefined; });
    await rateRequest;
    paintPrice();
  }

  function startPrice() {
    if (stopPrice || stopped || suspended || !visible || document.hidden) return;
    stopPrice = subscribeBitcoinPrice({
      onPrice(value) { point = value; paintPrice(); },
      onState(value) { state = value; paintPrice(); },
    });
    rateTimer = setInterval(() => { void refreshRates(); }, 60_000);
    void refreshRates();
  }

  function syncPrice() {
    if (stopped || suspended || !visible || document.hidden) {
      stopPrice?.();
      stopPrice = undefined;
      clearInterval(rateTimer);
      rateTimer = undefined;
    } else {
      startPrice();
    }
  }

  function syncVisibility() { syncPrice(); syncMotion(); paintPrice(); }

  function paintMotion() {
    const playing = !video.paused;
    toggle.setAttribute('aria-label', playing ? copy.pause : copy.play);
    toggle.title = playing ? copy.pause : copy.play;
    playIcon.toggleAttribute('hidden', playing);
    pauseIcon.toggleAttribute('hidden', !playing);
  }

  function syncMotion() {
    if (stopped || suspended || paused || !visible || document.hidden) {
      video.pause();
    } else {
      if (!video.getAttribute('src')) video.src = background.src;
      video.muted = true;
      void video.play().catch(() => { paintMotion(); });
    }
    paintMotion();
  }
  function toggleMotion() { paused = !video.paused; syncMotion(); }
  function nextBackground() {
    backgroundIndex = (backgroundIndex + 1) % backgrounds.length;
    background = backgrounds[backgroundIndex];
    video.pause();
    video.poster = background.poster;
    video.removeAttribute('src');
    video.load();
    syncMotion();
  }
  function motionChange() { paused = motion.matches; syncMotion(); }
  function pagehide(event: PageTransitionEvent) {
    if (!event.persisted) { stop(); return; }
    suspended = true;
    syncVisibility();
  }
  function pageshow() { suspended = false; syncVisibility(); }
  const observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    syncVisibility();
  });
  function stop() {
    if (stopped) return;
    stopped = true;
    stopCurrency();
    stopPrice?.();
    clearInterval(rateTimer);
    observer.disconnect();
    video.pause();
    toggle.removeEventListener('click', toggleMotion);
    next.removeEventListener('click', nextBackground);
    motion.removeEventListener('change', motionChange);
    video.removeEventListener('play', paintMotion);
    video.removeEventListener('pause', paintMotion);
    document.removeEventListener('visibilitychange', syncVisibility);
    window.removeEventListener('pagehide', pagehide);
    window.removeEventListener('pageshow', pageshow);
    window.removeEventListener('online', refreshRates);
  }
  toggle.hidden = false;
  next.hidden = false;
  toggle.addEventListener('click', toggleMotion);
  next.addEventListener('click', nextBackground);
  motion.addEventListener('change', motionChange);
  video.addEventListener('play', paintMotion);
  video.addEventListener('pause', paintMotion);
  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('pageshow', pageshow);
  window.addEventListener('online', refreshRates);
  const stopCurrency = subscribeCurrencyPreference(next => {
    currency = next;
    money = formatMoney();
    paintPrice();
    void refreshRates();
  });
  observer.observe(root);
  paintMotion();
  return stop;
}
