import { subscribeBitcoinPrice, type PriceFeedState } from '../lib/bitcoin-live-price';
import type { HistoryPoint } from '../lib/bitcoin-chart';

export function startVideoPreview(root: HTMLElement) {
  const copy: Record<string, string> = JSON.parse(root.dataset.copy!);
  const locale = root.dataset.locale || 'en';
  const price = root.querySelector<HTMLElement>('[data-video-price]')!;
  const status = root.querySelector<HTMLElement>('[data-video-price-status]')!;
  const video = root.querySelector<HTMLVideoElement>('[data-preview-video]')!;
  const backgrounds: { src: string; poster: string }[] = JSON.parse(root.dataset.backgrounds!);
  const background = backgrounds[Math.floor(Math.random() * backgrounds.length)];
  video.poster = background.poster;
  const toggle = root.querySelector<HTMLButtonElement>('[data-preview-motion]')!;
  const playIcon = toggle.querySelector<SVGElement>('[data-motion-play]')!;
  const pauseIcon = toggle.querySelector<SVGElement>('[data-motion-pause]')!;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  let point: HistoryPoint | undefined;
  let state: PriceFeedState = 'connecting';
  let visible = false;
  let paused = motion.matches;
  let suspended = false;
  let stopped = false;
  let stopPrice: (() => void) | undefined;

  function paintPrice() {
    if (point) {
      const formatted = money.format(point.price);
      price.textContent = formatted;
      price.title = `${copy.updated}: ${date.format(point.time)}`;
      price.setAttribute('aria-label', `${copy.price}: ${formatted} USD. ${price.title}`);
    }
    status.textContent = !navigator.onLine ? copy.offline : (point || state === 'connecting') ? copy[state] : copy.unavailable;
  }

  function startPrice() {
    if (stopPrice || stopped) return;
    stopPrice = subscribeBitcoinPrice({
      onPrice(value) { point = value; paintPrice(); },
      onState(value) { state = value; paintPrice(); },
    });
  }

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
  function motionChange() { paused = motion.matches; syncMotion(); }
  function pagehide(event: PageTransitionEvent) {
    if (!event.persisted) { stop(); return; }
    suspended = true;
    stopPrice?.(); stopPrice = undefined;
    syncMotion();
  }
  function pageshow() { suspended = false; startPrice(); syncMotion(); }
  const observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    syncMotion();
  });
  function stop() {
    if (stopped) return;
    stopped = true;
    stopPrice?.();
    observer.disconnect();
    video.pause();
    toggle.removeEventListener('click', toggleMotion);
    motion.removeEventListener('change', motionChange);
    video.removeEventListener('play', paintMotion);
    video.removeEventListener('pause', paintMotion);
    document.removeEventListener('visibilitychange', syncMotion);
    window.removeEventListener('pagehide', pagehide);
    window.removeEventListener('pageshow', pageshow);
  }
  toggle.hidden = false;
  toggle.addEventListener('click', toggleMotion);
  motion.addEventListener('change', motionChange);
  video.addEventListener('play', paintMotion);
  video.addEventListener('pause', paintMotion);
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('pageshow', pageshow);
  observer.observe(root);
  startPrice();
  return stop;
}
