import { createLivePriceDisplay } from '../lib/live-price-display';
import { createPartyPlaylist } from '../lib/party-music';
import { createPartyVisualizer } from '../lib/party-visualizer';
import { createPartyControls } from '../lib/party-controls';
import type { PartyCopy } from '../i18n/party';

const root = document.querySelector<HTMLElement>('[data-party-mode]');
if (root) startPartyMode(root);

function startPartyMode(root: HTMLElement) {
  const t: PartyCopy = JSON.parse(root.dataset.copy!);
  const locale = root.dataset.locale || 'en';
  let destroyed = false;
  const currencyNote = root.querySelector<HTMLElement>('[data-currency-note]')!;
  const priceDisplay = createLivePriceDisplay(root, { copy: t, locale, onPaint(currency) {
    currencyNote.hidden = currency === 'USD';
  } });

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

  priceDisplay.start();
  window.addEventListener('pagehide', () => {
    destroyed = true;
    priceDisplay.destroy();
    controlVisibility.destroy();
    visualizer.destroy();
    playlist.destroy();
    document.removeEventListener('fullscreenchange', updateFullscreen);
  }, { once: true });
  window.addEventListener('pageshow', event => {
    if (event.persisted && destroyed) window.location.reload();
  });
}
