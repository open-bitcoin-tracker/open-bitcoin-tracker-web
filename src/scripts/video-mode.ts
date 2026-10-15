import { CurrencyRates, isCurrency, type Currency } from '../lib/bitcoin-currency';
import { readDisplayPreferences, saveDisplayPreferences } from '../lib/bitcoin-display-preferences';
import { subscribeBitcoinPrice, type PriceFeedState } from '../lib/bitcoin-live-price';
import type { HistoryPoint } from '../lib/bitcoin-chart';
import { createYouTubePlayer, parseYouTubeVideo, type YouTubeVideo } from '../lib/youtube-player';
import { createVideoControls } from '../lib/video-controls';
import { createVideoCurrencyPicker } from '../lib/video-currency-picker';
import { createVideoPriceLayout } from '../lib/video-price-layout';
import { createVideoPriceStyle } from '../lib/video-price-style';
import type { PartyCopy } from '../i18n/party';
import type { VideoCopy } from '../i18n/video';

const VIDEO_SELECTION_KEY = 'obt-video-selection';
const VIDEO_PLAYBACK_KEY = 'obt-video-playback';

const root = document.querySelector<HTMLElement>('[data-video-mode]');
if (root) startVideoMode(root);

function startVideoMode(root: HTMLElement) {
  const t: PartyCopy & VideoCopy = JSON.parse(root.dataset.copy!);
  const locale = root.dataset.locale || 'en';
  const price = root.querySelector<HTMLElement>('[data-price]')!;
  const status = root.querySelector<HTMLElement>('[data-price-status]')!;
  const currencySelect = root.querySelector<HTMLSelectElement>('[data-currency]')!;
  const rates = new CurrencyRates();
  let currency: Currency = readDisplayPreferences().currency;
  const formatMoney = () => new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  let money = formatMoney();
  let livePoint: HistoryPoint | undefined;
  let state: PriceFeedState = 'connecting';
  let loadingRates = false;
  let destroyed = false;
  let rateRefresh: ReturnType<typeof setInterval> | undefined;
  let rateRequest: Promise<void> | undefined;
  let priceLayout: ReturnType<typeof createVideoPriceLayout> | undefined;

  function paintPrice() {
    if (destroyed || document.hidden) return;
    const rate = rates.current(currency);
    const value = livePoint && rate ? money.format(livePoint.price * rate.rate) : '—';
    price.textContent = value;
    price.style.setProperty('--price-chars', String([...value].length));
    if (livePoint && rate) price.removeAttribute('aria-label');
    else price.setAttribute('aria-label', t.unavailable);
    status.textContent = !navigator.onLine || state === 'offline' ? t.offline
      : currency !== 'USD' && !rate ? (loadingRates ? t.fxLoading : t.fxUnavailable)
      : !livePoint ? (state === 'connecting' ? t.loadingPrice : t.unavailable)
      : t[state];
    priceLayout?.refresh();
  }

  async function refreshRates() {
    if (destroyed || document.hidden || currency === 'USD' || !navigator.onLine) { paintPrice(); return; }
    if (rateRequest) { await rateRequest; paintPrice(); return; }
    loadingRates = true;
    paintPrice();
    rateRequest = rates.refreshLatest().catch(() => {
      // Expired or unavailable exchange rates must not produce a guessed price.
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
  const currencyPicker = createVideoCurrencyPicker(root, currencySelect);
  priceLayout = createVideoPriceLayout(root);
  const priceStyle = createVideoPriceStyle(root, () => priceLayout?.refresh());
  const stopPrice = subscribeBitcoinPrice({
    onPrice(point) { livePoint = point; paintPrice(); },
    onState(value) { state = value; paintPrice(); },
  });

  const form = root.querySelector<HTMLFormElement>('[data-video-form]')!;
  const input = root.querySelector<HTMLInputElement>('[data-video-url]')!;
  const loadButton = root.querySelector<HTMLButtonElement>('[data-load-video]')!;
  const cancelButton = root.querySelector<HTMLButtonElement>('[data-cancel-video]')!;
  const controls = root.querySelector<HTMLElement>('[data-video-controls]')!;
  const playButton = root.querySelector<HTMLButtonElement>('[data-play-pause]')!;
  const muteButton = root.querySelector<HTMLButtonElement>('[data-mute]')!;
  const volumeInput = root.querySelector<HTMLInputElement>('[data-video-volume]')!;
  const changeButton = root.querySelector<HTMLButtonElement>('[data-change-video]')!;
  const seek = root.querySelector<HTMLInputElement>('[data-video-seek]')!;
  const currentTime = root.querySelector<HTMLElement>('[data-video-current]')!;
  const totalTime = root.querySelector<HTMLElement>('[data-video-duration]')!;
  const subtitlesButton = root.querySelector<HTMLButtonElement>('[data-subtitles]')!;
  const loopButton = root.querySelector<HTMLButtonElement>('[data-loop]')!;
  const error = root.querySelector<HTMLElement>('[data-video-error]')!;
  const videoStatus = root.querySelector<HTMLElement>('[data-video-status]')!;
  const uiVisibility = createVideoControls(root);
  let hasVideo = false;
  let focusRecovery = true;
  let playing = false;
  let muted = false;
  let volume = 100;
  let lastAudibleVolume = 100;
  let looping = false;
  let subtitlesWanted = false;
  let subtitlesEnabled = false;
  let scrubbing = false;
  let adjustingVolume = false;
  let duration = 0;
  let progressRefresh: ReturnType<typeof setInterval> | undefined;

  try {
    const saved = JSON.parse(window.localStorage.getItem(VIDEO_PLAYBACK_KEY) ?? 'null');
    if (saved?.version === 1) {
      if (typeof saved.volume === 'number' && Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 100) {
        volume = Math.round(saved.volume);
      }
      lastAudibleVolume = volume > 0 ? volume : 100;
      if (typeof saved.lastAudibleVolume === 'number' && Number.isFinite(saved.lastAudibleVolume) && saved.lastAudibleVolume >= 1 && saved.lastAudibleVolume <= 100) {
        lastAudibleVolume = Math.round(saved.lastAudibleVolume);
      }
      muted = volume === 0 || saved.muted === true;
      looping = saved.looping === true;
      subtitlesWanted = saved.subtitlesWanted === true;
    }
  } catch { /* Keep playback usable when saved settings are malformed or storage is blocked. */ }
  const mobileAudio = window.matchMedia('(hover: none) and (pointer: coarse)');
  let phoneAudio = mobileAudio.matches;
  let desktopAudio = { volume, muted, lastAudibleVolume };
  if (phoneAudio) { volume = lastAudibleVolume = 100; muted = false; }

  function savePlaybackPreferences() {
    if (destroyed) return;
    try {
      window.localStorage.setItem(VIDEO_PLAYBACK_KEY, JSON.stringify({
        version: 1, ...(phoneAudio ? desktopAudio : { volume, muted, lastAudibleVolume }), looping, subtitlesWanted,
      }));
    } catch { /* Settings remain usable when storage is blocked or full. */ }
  }

  function updateIdle() {
    uiVisibility.setEnabled(hasVideo && form.hidden && !scrubbing && !adjustingVolume);
  }

  function showForm(show: boolean, focus = true) {
    form.hidden = !show;
    controls.hidden = show;
    cancelButton.hidden = !hasVideo;
    updateIdle();
    if (!focus) return;
    if (show) { input.focus(); input.select(); }
    else changeButton.focus();
  }

  function setPlaying(value: boolean) {
    playing = value;
    const label = playing ? t.pause : t.play;
    playButton.setAttribute('aria-label', label);
    playButton.title = label;
    root.querySelector<SVGElement>('[data-play-icon]')!.toggleAttribute('hidden', playing);
    root.querySelector<SVGElement>('[data-pause-icon]')!.toggleAttribute('hidden', !playing);
    if (playing) { videoStatus.hidden = true; error.hidden = true; }
  }

  function formatTime(seconds: number) {
    const whole = Math.floor(Math.max(0, seconds));
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor(whole / 60) % 60;
    const remainder = String(whole % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
  }

  function renderPosition(seconds: number) {
    const current = formatTime(seconds);
    const total = duration > 0 ? formatTime(duration) : '—';
    currentTime.textContent = current;
    totalTime.textContent = total;
    seek.setAttribute('aria-valuetext', t.playbackPosition.replace('{current}', current).replace('{duration}', total));
    seek.style.setProperty('--video-progress', `${duration > 0 ? seconds / duration * 100 : 0}%`);
  }

  function seekValue() {
    const value = Number(seek.value);
    return Number.isFinite(value) ? Math.min(duration, Math.max(0, value)) : 0;
  }

  function paintProgress() {
    if (destroyed || document.hidden || !hasVideo) return;
    const progress = player.getProgress();
    duration = Number.isFinite(progress.duration) && progress.duration > 0 ? progress.duration : 0;
    if (duration > 0 && videoStatus.textContent === t.loadingVideo) videoStatus.hidden = true;
    seek.disabled = duration <= 0;
    seek.max = String(duration);
    if (scrubbing) return;
    const position = Number.isFinite(progress.currentTime) ? Math.min(duration, Math.max(0, progress.currentTime)) : 0;
    seek.value = String(position);
    renderPosition(position);
  }

  function stopProgressRefresh() {
    if (progressRefresh !== undefined) clearInterval(progressRefresh);
    progressRefresh = undefined;
  }

  function startProgressRefresh() {
    stopProgressRefresh();
    if (destroyed || document.hidden || !hasVideo) return;
    paintProgress();
    progressRefresh = setInterval(paintProgress, 500);
  }

  function updateCaptions(enabled: boolean, available: boolean) {
    subtitlesEnabled = enabled && available;
    root.toggleAttribute('data-subtitles-enabled', subtitlesEnabled);
    subtitlesButton.disabled = !available;
    subtitlesButton.setAttribute('aria-pressed', String(subtitlesEnabled));
    subtitlesButton.title = available ? t.subtitles : t.subtitlesUnavailable;
  }

  function paintAudio() {
    const label = muted ? t.unmute : t.mute;
    muteButton.setAttribute('aria-label', label);
    muteButton.title = label;
    root.querySelector<SVGElement>('[data-muted-icon]')!.toggleAttribute('hidden', !muted);
    root.querySelector<SVGElement>('[data-sound-icon]')!.toggleAttribute('hidden', muted);
    volumeInput.value = String(volume);
    volumeInput.setAttribute('aria-valuetext', new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(volume / 100));
    volumeInput.style.setProperty('--video-progress', `${volume}%`);
  }

  function changeVolume(value: number) {
    if (!Number.isFinite(value)) { paintAudio(); return; }
    volume = Math.round(Math.min(100, Math.max(0, value)));
    if (volume > 0) lastAudibleVolume = volume;
    muted = volume === 0;
    player.setVolume(volume);
    player.setMuted(muted);
    paintAudio();
    savePlaybackPreferences();
  }

  paintAudio();
  loopButton.setAttribute('aria-pressed', String(looping));

  const player = createYouTubePlayer(root.querySelector<HTMLElement>('[data-video-player]')!, {
    title: t.backgroundTitle,
    onState(value) {
      if (destroyed) return;
      setPlaying(value);
    },
    onError(code) {
      if (destroyed) return;
      hasVideo = false;
      scrubbing = false;
      adjustingVolume = false;
      stopProgressRefresh();
      setPlaying(false);
      seek.disabled = true;
      volumeInput.disabled = true;
      playButton.disabled = true;
      error.textContent = code === 101 || code === 150 ? t.embeddingDisabled : t.videoUnavailable;
      if (code !== undefined) error.setAttribute('data-youtube-error', String(code));
      else error.removeAttribute('data-youtube-error');
      error.hidden = false;
      videoStatus.hidden = true;
      showForm(true, focusRecovery);
    },
    onBlocked() {
      if (destroyed) return;
      setPlaying(false);
      videoStatus.textContent = '';
      videoStatus.hidden = true;
    },
    onCaptions({ enabled, available }) {
      if (!destroyed) updateCaptions(enabled, available);
    },
  });
  // Queue saved settings before a restored video can initialize or autoplay.
  player.setVolume(volume);
  player.setMuted(muted);
  player.setLoop(looping);
  player.setCaptions(subtitlesWanted);
  function updateAudioMode() {
    if (destroyed || phoneAudio === mobileAudio.matches) return;
    phoneAudio = mobileAudio.matches;
    if (phoneAudio) {
      desktopAudio = { volume, muted, lastAudibleVolume };
      volume = lastAudibleVolume = 100;
      muted = false;
    } else {
      ({ volume, muted, lastAudibleVolume } = desktopAudio);
    }
    adjustingVolume = false;
    muteButton.disabled = volumeInput.disabled = phoneAudio || !hasVideo;
    player.setVolume(volume);
    player.setMuted(muted);
    paintAudio();
    updateIdle();
  }
  mobileAudio.addEventListener('change', updateAudioMode);

  function loadSelectedVideo(video: YouTubeVideo, { focus = true, persist = true } = {}) {
    if (destroyed) return;
    // Store only the validated ID and requested start time, without share tracking.
    const url = `https://www.youtube.com/watch?v=${video.id}${video.startSeconds > 0 ? `&t=${video.startSeconds}s` : ''}`;
    if (persist) {
      try { window.localStorage.setItem(VIDEO_SELECTION_KEY, JSON.stringify({ version: 1, url })); }
      catch { /* Playback remains available when browser storage is blocked. */ }
    }
    input.value = url;
    focusRecovery = focus;
    input.removeAttribute('aria-invalid');
    error.removeAttribute('data-youtube-error');
    error.hidden = true;
    hasVideo = true;
    scrubbing = false;
    adjustingVolume = false;
    duration = 0;
    seek.value = seek.max = '0';
    seek.disabled = true;
    renderPosition(0);
    updateCaptions(false, false);
    playButton.disabled = loopButton.disabled = false;
    muteButton.disabled = volumeInput.disabled = phoneAudio;
    setPlaying(false);
    videoStatus.textContent = t.loadingVideo;
    videoStatus.hidden = false;
    showForm(false, focus);
    player.load(video);
    startProgressRefresh();
  }

  function restoreSelectedVideo() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(VIDEO_SELECTION_KEY) ?? 'null');
      if (saved?.version !== 1 || typeof saved.url !== 'string') return;
      const video = parseYouTubeVideo(saved.url);
      if (video) loadSelectedVideo(video, { focus: false, persist: false });
    } catch { /* Missing, malformed, or blocked storage leaves the URL picker ready. */ }
  }

  input.disabled = loadButton.disabled = changeButton.disabled = false;
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (destroyed) return;
    const video = parseYouTubeVideo(input.value);
    if (!video) {
      input.setAttribute('aria-invalid', 'true');
      error.textContent = t.invalidUrl;
      error.hidden = false;
      input.focus();
      return;
    }
    loadSelectedVideo(video);
  });
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    error.hidden = true;
  });
  changeButton.addEventListener('click', () => {
    input.value = '';
    input.removeAttribute('aria-invalid');
    error.hidden = true;
    error.removeAttribute('data-youtube-error');
    showForm(true);
  });
  function cancelEdit() {
    if (!hasVideo) return;
    input.removeAttribute('aria-invalid');
    error.hidden = true;
    showForm(false);
  }
  cancelButton.addEventListener('click', cancelEdit);
  input.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !hasVideo) return;
    event.preventDefault();
    cancelEdit();
  });
  playButton.addEventListener('click', () => {
    if (playing) player.pause();
    else player.play();
  });
  muteButton.addEventListener('click', () => {
    if (phoneAudio) return;
    if (muted && volume === 0) { changeVolume(lastAudibleVolume); return; }
    muted = !muted;
    player.setMuted(muted);
    paintAudio();
    savePlaybackPreferences();
  });
  volumeInput.addEventListener('input', () => {
    if (!volumeInput.disabled) changeVolume(Number(volumeInput.value));
  });
  volumeInput.addEventListener('pointerdown', event => {
    if (volumeInput.disabled) return;
    adjustingVolume = true;
    try { volumeInput.setPointerCapture(event.pointerId); } catch { /* Native range controls still work without capture. */ }
    updateIdle();
  });
  loopButton.addEventListener('click', () => {
    looping = !looping;
    player.setLoop(looping);
    loopButton.setAttribute('aria-pressed', String(looping));
    savePlaybackPreferences();
  });
  subtitlesButton.addEventListener('click', () => {
    // Unavailable tracks and delayed player callbacks must not erase the user's choice.
    subtitlesWanted = !subtitlesEnabled;
    savePlaybackPreferences();
    player.setCaptions(subtitlesWanted);
  });
  seek.addEventListener('pointerdown', event => {
    if (seek.disabled) return;
    scrubbing = true;
    // Keep receiving the release even if the pointer leaves the timeline.
    try { seek.setPointerCapture(event.pointerId); } catch { /* Native range dragging still works without capture. */ }
    updateIdle();
  });
  seek.addEventListener('input', () => {
    if (seek.disabled) return;
    scrubbing = true;
    renderPosition(seekValue());
    updateIdle();
  });
  seek.addEventListener('change', () => {
    if (seek.disabled) return;
    const value = seekValue();
    scrubbing = false;
    seek.value = String(value);
    player.seekTo(value);
    renderPosition(value);
    updateIdle();
  });
  function releaseSeek() {
    if (!scrubbing && !adjustingVolume) return;
    scrubbing = false;
    adjustingVolume = false;
    updateIdle();
  }
  function cancelSeek() {
    if (!scrubbing && !adjustingVolume) return;
    const wasScrubbing = scrubbing;
    scrubbing = false;
    adjustingVolume = false;
    if (wasScrubbing) paintProgress();
    updateIdle();
  }
  seek.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !scrubbing) return;
    event.preventDefault();
    cancelSeek();
  });
  window.addEventListener('pointerup', releaseSeek);
  window.addEventListener('pointercancel', cancelSeek);

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
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    void request.catch(() => { controlStatus.textContent = t.fullscreenUnavailable; controlStatus.hidden = false; });
  });
  document.addEventListener('fullscreenchange', updateFullscreen);
  updateFullscreen();

  function onVisibility() {
    if (rateRefresh !== undefined) clearInterval(rateRefresh);
    rateRefresh = undefined;
    stopProgressRefresh();
    if (document.hidden) { scrubbing = false; adjustingVolume = false; }
    if (!destroyed && !document.hidden) {
      void refreshRates();
      rateRefresh = setInterval(() => { void refreshRates(); }, 60_000);
      paintPrice();
      startProgressRefresh();
      updateIdle();
    }
  }
  const onOnline = () => { void refreshRates(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  restoreSelectedVideo();
  onVisibility();
  window.addEventListener('pagehide', () => {
    if (destroyed) return;
    destroyed = true;
    stopPrice();
    currencyPicker.destroy();
    priceStyle.destroy();
    priceLayout?.destroy();
    uiVisibility.destroy();
    stopProgressRefresh();
    player.destroy();
    if (rateRefresh !== undefined) clearInterval(rateRefresh);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('fullscreenchange', updateFullscreen);
    window.removeEventListener('online', onOnline);
    mobileAudio.removeEventListener('change', updateAudioMode);
    window.removeEventListener('pointerup', releaseSeek);
    window.removeEventListener('pointercancel', cancelSeek);
  }, { once: true });
  window.addEventListener('pageshow', event => {
    if (event.persisted && destroyed) window.location.reload();
  });
}
