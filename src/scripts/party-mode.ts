import { CurrencyRates, isCurrency, type Currency } from '../lib/bitcoin-currency';
import { readDisplayPreferences, saveDisplayPreferences } from '../lib/bitcoin-display-preferences';
import { subscribeBitcoinPrice, type PriceFeedState } from '../lib/bitcoin-live-price';
import type { HistoryPoint } from '../lib/bitcoin-chart';
import { createPartyPlaylist } from '../lib/party-music';
import { createPartyVisualizer } from '../lib/party-visualizer';
import { createPartyControls } from '../lib/party-controls';
import type { PartyCopy } from '../i18n/party';

const root = document.querySelector<HTMLElement>('[data-party-mode]');
if (root) startPartyMode(root);

function startPartyMode(root: HTMLElement) {
  const t: PartyCopy = JSON.parse(root.dataset.copy!);
  const locale = root.dataset.locale || 'en';
  const price = root.querySelector<HTMLElement>('[data-price]')!;
  const status = root.querySelector<HTMLElement>('[data-price-status]')!;
  const currencySelect = root.querySelector<HTMLSelectElement>('[data-currency]')!;
  const currencyNote = root.querySelector<HTMLElement>('[data-currency-note]')!;
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
    currencyNote.hidden = currency === 'USD';
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
  currencySelect.addEventListener('change', () => {
    if (!isCurrency(currencySelect.value)) return;
    currency = currencySelect.value;
    money = formatMoney();
    saveDisplayPreferences({ ...readDisplayPreferences(), currency });
    paintPrice();
    void refreshRates();
  });
  const stopPrice = subscribeBitcoinPrice({
    onPrice(point) { livePoint = point; paintPrice(); },
    onState(value) { state = value; paintPrice(); },
  });

  const visualizer = createPartyVisualizer(root.querySelector<HTMLCanvasElement>('[data-visualizer]')!);
  const chooser = root.querySelector<HTMLElement>('[data-music-chooser]')!;
  const fileInput = root.querySelector<HTMLInputElement>('[data-music-files]')!;
  const chooseButton = root.querySelector<HTMLButtonElement>('[data-choose-files]')!;
  const controls = root.querySelector<HTMLElement>('[data-playback-controls]')!;
  const playButton = root.querySelector<HTMLButtonElement>('[data-play-pause]')!;
  const previousButton = root.querySelector<HTMLButtonElement>('[data-previous-track]')!;
  const nextButton = root.querySelector<HTMLButtonElement>('[data-next-track]')!;
  const pauseIcon = root.querySelector<SVGElement>('[data-audio-pause-icon]')!;
  const playIcon = root.querySelector<SVGElement>('[data-audio-play-icon]')!;
  const musicStatus = root.querySelector<HTMLElement>('[data-music-status]')!;
  const musicError = root.querySelector<HTMLElement>('[data-music-error]')!;
  const controlVisibility = createPartyControls(playButton);
  let choosingReplacement = false;
  const playlist = createPartyPlaylist(root.querySelector<HTMLAudioElement>('[data-audio]')!, {
    onState(playback) {
      if (destroyed) return;
      chooser.hidden = playback.hasTracks && !choosingReplacement;
      controls.hidden = !playback.hasTracks;
      playButton.disabled = !playback.hasTracks;
      previousButton.hidden = nextButton.hidden = playback.trackCount < 2;
      previousButton.disabled = !playback.canPrevious;
      nextButton.disabled = !playback.canNext;
      const label = playback.playing ? t.pause : t.play;
      playButton.setAttribute('aria-label', label);
      playButton.title = label;
      pauseIcon.toggleAttribute('hidden', !playback.playing);
      playIcon.toggleAttribute('hidden', playback.playing);
      musicStatus.textContent = playback.hasTracks ? t.nowPlaying
        .replace('{index}', String(playback.trackIndex + 1))
        .replace('{count}', String(playback.trackCount))
        .replace('{name}', playback.trackName) : '';
      visualizer.setPlaying(playback.playing);
      controlVisibility.setPlaying(playback.playing);
    },
    onError(error) {
      if (destroyed) return;
      musicError.textContent = t[error];
      musicError.hidden = false;
      // A rejected or undecodable file must leave a way to choose another.
      if (error !== 'visualizerUnavailable') { choosingReplacement = true; chooser.hidden = false; }
    },
    onAnalyser(analyser) { visualizer.setAnalyser(analyser); },
  });
  fileInput.disabled = chooseButton.disabled = false;
  chooseButton.addEventListener('click', () => { fileInput.click(); });
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files ?? []);
    if (!files.length) return;
    musicError.hidden = true;
    choosingReplacement = false;
    if (playlist.selectFiles(files)) playButton.focus();
    fileInput.value = '';
  });
  playButton.addEventListener('click', () => {
    musicError.hidden = true;
    choosingReplacement = false;
    void playlist.toggle();
  });
  previousButton.addEventListener('click', () => {
    musicError.hidden = true;
    choosingReplacement = false;
    playlist.previous();
  });
  nextButton.addEventListener('click', () => {
    musicError.hidden = true;
    choosingReplacement = false;
    playlist.next();
  });

  const fullscreen = root.querySelector<HTMLButtonElement>('[data-fullscreen]')!;
  const controlStatus = root.querySelector<HTMLElement>('[data-control-status]')!;
  function updateFullscreen() {
    const label = document.fullscreenElement ? t.exitFullscreen : t.fullscreen;
    fullscreen.setAttribute('aria-label', label);
    fullscreen.title = label;
  }
  fullscreen.hidden = !document.fullscreenEnabled;
  fullscreen.disabled = !document.fullscreenEnabled;
  fullscreen.addEventListener('click', () => {
    // Fullscreen the document so the site navigation's modal remains available.
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    void request.catch(() => { controlStatus.textContent = t.fullscreenUnavailable; controlStatus.hidden = false; });
  });
  document.addEventListener('fullscreenchange', updateFullscreen);

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
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  onVisibility();
  window.addEventListener('pagehide', () => {
    destroyed = true;
    stopPrice();
    controlVisibility.destroy();
    visualizer.destroy();
    if (rateRefresh !== undefined) clearInterval(rateRefresh);
    playlist.destroy();
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('fullscreenchange', updateFullscreen);
    window.removeEventListener('online', onOnline);
  }, { once: true });
  window.addEventListener('pageshow', event => {
    if (event.persisted && destroyed) window.location.reload();
  });
}
