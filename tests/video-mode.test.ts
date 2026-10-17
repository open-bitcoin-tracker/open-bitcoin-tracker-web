import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import type { HistoryPoint } from '../src/lib/bitcoin-chart.ts';
import type { Currency } from '../src/lib/bitcoin-currency.ts';
import type { DisplayPreferences } from '../src/lib/bitcoin-display-preferences.ts';
import type { PriceFeedState } from '../src/lib/bitcoin-live-price.ts';
import { parseYouTubeVideo } from '../src/lib/youtube-player.ts';
import { videoSections, videoSuggestions } from '../src/lib/video-suggestions.ts';
import { video as videoCopy } from '../src/i18n/video.ts';
import type { createVideoPickerTabs } from '../src/lib/video-picker-tabs.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/scripts/video-mode.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const pickerScript = ts.transpileModule(readFileSync(new URL('../src/lib/video-picker-tabs.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const copy = {
  unavailable: 'Price unavailable', connecting: 'Connecting', live: 'Live', delayed: 'Reconnecting', offline: 'Offline',
  loadingPrice: 'Waiting for price', fxLoading: 'Loading exchange rate', fxUnavailable: 'Exchange rate unavailable',
  play: 'Play', pause: 'Pause', mute: 'Mute video', unmute: 'Unmute video',
  invalidUrl: 'Enter a valid YouTube video URL.', videoUnavailable: 'This video cannot be played here.',
  embeddingDisabled: 'The owner of this video does not allow embedded playback. Try another YouTube video.',
  loadingVideo: 'Loading video', backgroundTitle: 'YouTube background video',
  removeRecent: 'Remove from recent videos', recentTitleLoading: 'Loading title…', recentTitleUnavailable: 'Title unavailable',
  seek: 'Video progress', loop: 'Loop video', volume: 'Volume',
  playbackPosition: '{current} of {duration}',
  fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', fullscreenUnavailable: 'Fullscreen unavailable',
};
const firstUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
const secondUrl = 'https://youtu.be/ZYXWVUTSRQP?t=30';
const canonicalSecondUrl = 'https://www.youtube.com/watch?v=ZYXWVUTSRQP&t=30s';
const videoSelectionKey = 'obt-video-selection';
const videoPlaybackKey = 'obt-video-playback';
type Video = { id: string; startSeconds: number };
type Progress = { currentTime: number; duration: number; isLive?: boolean };
type Captions = { enabled: boolean; available: boolean };

class Control extends EventTarget {
  children: Control[] = [];
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  controls = new Map<string, Control>();
  style = { values: new Map<string, string>(), setProperty(name: string, value: string) { this.values.set(name, value); } };
  textContent = '—';
  hidden = false;
  open = false;
  showModalCount = 0;
  showModal() { this.open = true; this.showModalCount++; }
  close() { this.open = false; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 512, bottom: 800 }; }
  disabled = false;
  value = '';
  min = '0';
  max = '0';
  step = '1';
  title = '';
  className = '';
  type = '';
  tabIndex = 0;
  focusCount = 0;
  selectCount = 0;
  capturedPointers = new Set<number>();
  get valueAsNumber() { return Number(this.value); }
  set valueAsNumber(value: number) { this.value = String(value); }
  querySelector(selector: string): Control {
    if (!this.controls.has(selector)) this.controls.set(selector, new Control());
    return this.controls.get(selector)!;
  }
  querySelectorAll(selector: string): Control[] {
    assert.equal(selector, '[data-video-suggestion]');
    return videoSuggestions.map(suggestion => {
      const button = this.querySelector(`[data-video-suggestion="${suggestion.id}"]`);
      button.dataset.videoSuggestion = suggestion.id;
      return button;
    });
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  toggleAttribute(name: string, force: boolean) { if (force) this.attributes.set(name, ''); else this.attributes.delete(name); }
  focus() { this.focusCount++; }
  select() { this.selectCount++; }
  setPointerCapture(id: number) { this.capturedPointers.add(id); }
  releasePointerCapture(id: number) { this.capturedPointers.delete(id); }
  hasPointerCapture(id: number) { return this.capturedPointers.has(id); }
  append(...children: Control[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
}

interface Options {
  preferences?: DisplayPreferences;
  rates?: Partial<Record<Currency, number>>;
  hidden?: boolean;
  fullscreen?: boolean;
  storedSelection?: string;
  storedPlayback?: string;
  blockedStorage?: boolean;
  mobile?: boolean;
  viewportWidth?: number;
  reducedMotion?: boolean;
  realPicker?: boolean;
  storedRecents?: string;
}

function harness(options: Options = {}) {
  const root = new Control();
  root.dataset = { copy: JSON.stringify(copy), locale: 'en-US' };
  for (const selector of ['[data-video-controls]', '[data-video-error]', '[data-video-status]', '[data-control-status]']) {
    root.querySelector(selector).hidden = true;
  }
  for (const selector of ['[data-currency]', '[data-video-url]', '[data-load-video]', '[data-play-pause]', '[data-mute]', '[data-change-video]', '[data-video-seek]', '[data-video-volume]', '[data-loop]']) {
    root.querySelector(selector).disabled = true;
  }
  root.querySelector('[data-mute]').setAttribute('aria-label', copy.mute);
  root.querySelector('[data-muted-icon]').setAttribute('hidden', '');
  root.querySelector('[data-video-seek]').value = '0';
  root.querySelector('[data-video-volume]').value = '100';
  root.querySelector('[data-video-volume]').max = '100';
  root.querySelector('[data-video-volume]').setAttribute('aria-label', copy.volume);
  for (const [selector, label] of [['[data-loop]', copy.loop]]) {
    root.querySelector(selector).setAttribute('aria-label', label);
    root.querySelector(selector).setAttribute('aria-pressed', 'false');
  }
  let fullscreenRequests = 0;
  let fullscreenExits = 0;
  let rejectFullscreen = false;
  const documentElement = {
    async requestFullscreen() {
      fullscreenRequests++;
      if (rejectFullscreen) throw Error('Fullscreen denied');
      document.fullscreenElement = documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
    },
  };
  const document = Object.assign(new EventTarget(), {
    createElement: () => new Control(),
    createElementNS: () => new Control(),
    hidden: options.hidden ?? false, fullscreenEnabled: options.fullscreen ?? false,
    fullscreenElement: null as object | null, documentElement,
    querySelector: () => root,
    async exitFullscreen() {
      fullscreenExits++;
      if (rejectFullscreen) throw Error('Fullscreen denied');
      document.fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    },
  });
  let reloads = 0;
  const storage = new Map<string, string>();
  if (options.storedSelection !== undefined) storage.set(videoSelectionKey, options.storedSelection);
  if (options.storedPlayback !== undefined) storage.set(videoPlaybackKey, options.storedPlayback);
  if (options.storedRecents !== undefined) storage.set('obt-video-recents', options.storedRecents);
  const storageWrites: { key: string; value: string }[] = [];
  const mobileAudio = Object.assign(new EventTarget(), { matches: options.mobile ?? false });
  const window = Object.assign(new EventTarget(), {
    matchMedia: (query: string) => {
      if (query === '(prefers-reduced-motion: reduce)') return { matches: options.reducedMotion ?? false };
      const maxWidth = query.match(/max-width:\s*(\d+)px/);
      return maxWidth
        ? Object.assign(new EventTarget(), { matches: (options.viewportWidth ?? 1280) <= Number(maxWidth[1]) })
        : mobileAudio;
    },
    location: { reload() { reloads++; } },
    localStorage: {
      getItem(key: string) { if (options.blockedStorage) throw Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key: string, value: string) {
        if (options.blockedStorage) throw Error('Storage blocked');
        storage.set(key, value);
        storageWrites.push({ key, value });
      },
    },
  });
  const navigator = { onLine: true };
  let preferences: DisplayPreferences = { ...options.preferences ?? { currency: 'USD', scale: 'logarithmic' } };
  const saved: DisplayPreferences[] = [];
  const rates = new Map<Currency, number>();
  for (const [currency, rate] of Object.entries(options.rates ?? {})) rates.set(currency as Currency, rate!);
  const requests: { resolve: (values: Partial<Record<Currency, number>>) => void; reject: () => void }[] = [];
  const intervals = new Map<number, () => void>();
  const intervalDurations = new Map<number, number>();
  const timeouts = new Map<number, () => void>();
  let timerId = 0;
  let feed: { onPrice(point: HistoryPoint): void; onState(state: PriceFeedState): void };
  let feedStops = 0;
  const loaded: Video[] = [];
  const muted: boolean[] = [];
  const volumes: number[] = [];
  const sought: number[] = [];
  const loopStates: boolean[] = [];
  const captionStates: boolean[] = [];
  const playbackAtLoad: { volume?: number; muted?: boolean; looping?: boolean; subtitlesWanted?: boolean }[] = [];
  let progress: Progress = { currentTime: 0, duration: 0 };
  let progressCalls = 0;
  let playCalls = 0;
  let pauseCalls = 0;
  let playerDestroys = 0;
  let idleEnabled = false;
  let controlsDestroys = 0;
  let currencyPickerDestroys = 0;
  const initializations: string[] = [];
  const rememberedUrls: string[] = [];
  let pickerTabDestroys = 0;
  const layoutRoots: unknown[] = [];
  const layoutRefreshes: { price: string; currency: string }[] = [];
  let priceLayoutDestroys = 0;
  let revealCalls = 0;
  const idleStates: boolean[] = [];
  let callbacks: { title: string; onState(playing: boolean): void; onError(code?: number): void; onBlocked(): void; onCaptions?(state: Captions): void; onLiveStatus?(id: string, isLive: boolean): void };
  class Rates {
    current(currency: Currency) {
      const rate = currency === 'USD' ? 1 : rates.get(currency);
      return rate === undefined ? undefined : { time: 0, rate };
    }
    refreshLatest(): Promise<void> {
      return new Promise((resolve, reject) => requests.push({
        resolve(values) {
          for (const [currency, rate] of Object.entries(values)) rates.set(currency as Currency, rate!);
          resolve();
        },
        reject: () => reject(Error('Rates unavailable')),
      }));
    }
  }
  const modules = {
    CurrencyRates: Rates,
    isCurrency: (value: string) => ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY'].includes(value),
    readDisplayPreferences: () => ({ ...preferences }),
    saveDisplayPreferences: (next: DisplayPreferences) => { preferences = { ...next }; saved.push({ ...next }); },
    subscribeBitcoinPrice: (input: typeof feed) => {
      feed = input;
      feed.onState('connecting');
      return () => { feedStops++; };
    },
    createVideoControls: () => ({
      setEnabled(value: boolean) { idleEnabled = value; idleStates.push(value); },
      reveal() { revealCalls++; },
      destroy() { controlsDestroys++; },
    }),
    createVideoCurrencyPicker: () => {
      initializations.push('currencyPicker');
      return { destroy() { currencyPickerDestroys++; } };
    },
    createVideoPriceLayout: (input: unknown) => {
      initializations.push('priceLayout');
      layoutRoots.push(input);
      return {
        refresh() {
          layoutRefreshes.push({
            price: root.querySelector('[data-price]').textContent,
            currency: root.querySelector('[data-currency]').value,
          });
        },
        destroy() { priceLayoutDestroys++; },
      };
    },
    createVideoPriceStyle: (_root: unknown, refreshLayout: () => void) => {
      refreshLayout();
      return { destroy() {} };
    },
    createVideoPickerTabs: (pickerRoot: HTMLElement, pickerOptions: Parameters<typeof createVideoPickerTabs>[1]) => {
      let picker: ReturnType<typeof createVideoPickerTabs> | undefined;
      if (options.realPicker) {
        const exports: { createVideoPickerTabs?: typeof createVideoPickerTabs } = {};
        runInNewContext(pickerScript, {
          exports, require: () => ({ parseYouTubeVideo, videoSections, videoSuggestions }), document, window,
          AbortController, AbortSignal, URLSearchParams, fetch: async () => ({ ok: false }),
        });
        picker = exports.createVideoPickerTabs!(pickerRoot, pickerOptions);
      }
      return {
        remember(url: string, rememberOptions?: { deferRender?: boolean }) { rememberedUrls.push(url); picker?.remember(url, rememberOptions); },
        refresh() { picker?.refresh(); },
        setLiveStatus(id: string, isLive: boolean) { picker?.setLiveStatus(id, isLive); },
        destroy() { pickerTabDestroys++; picker?.destroy(); },
      };
    },
    // Exercise the real URL boundary without loading the external iframe API.
    parseYouTubeVideo,
    createYouTubePlayer: (_container: unknown, input: typeof callbacks) => {
      callbacks = input;
      callbacks.onState(false);
      callbacks.onCaptions?.({ enabled: false, available: false });
      return {
        load(video: Video) {
          playbackAtLoad.push({ volume: volumes.at(-1), muted: muted.at(-1), looping: loopStates.at(-1), subtitlesWanted: captionStates.at(-1) });
          loaded.push(video); progress = { currentTime: video.startSeconds, duration: 0 }; callbacks.onState(false);
        },
        play() { playCalls++; callbacks.onState(true); },
        pause() { pauseCalls++; callbacks.onState(false); },
        setMuted(value: boolean) { muted.push(value); },
        setVolume(value: number) { volumes.push(value); },
        getProgress() { progressCalls++; return { ...progress }; },
        seekTo(seconds: number) { sought.push(seconds); progress.currentTime = seconds; },
        setLoop(value: boolean) { loopStates.push(value); },
        setCaptions(value: boolean) { captionStates.push(value); },
        destroy() { playerDestroys++; },
      };
    },
  };
  runInNewContext(script, {
    require: () => modules, exports: {}, document, window, navigator, Intl,
    setInterval: (callback: () => void, duration: number) => { intervals.set(++timerId, callback); intervalDurations.set(timerId, duration); return timerId; },
    clearInterval: (id: number) => { intervals.delete(id); intervalDurations.delete(id); },
    setTimeout: (callback: () => void) => { timeouts.set(++timerId, callback); return timerId; },
    clearTimeout: (id: number) => { timeouts.delete(id); },
  });
  const control = (selector: string) => root.querySelector(selector);
  const finishPickerTransition = () => control('[data-video-picker]').dispatchEvent(Object.assign(new Event('transitionend'), { propertyName: 'transform' }));
  return {
    root, window, requests, intervals, timeouts, loaded, muted, volumes, sought, loopStates, captionStates, playbackAtLoad, control, storage, storageWrites, finishPickerTransition,
    mobile(matches: boolean) { mobileAudio.matches = matches; mobileAudio.dispatchEvent(new Event('change')); },
    initializations, layoutRoots, layoutRefreshes, rememberedUrls, pickerTabDestroys: () => pickerTabDestroys, priceLayoutDestroys: () => priceLayoutDestroys,
    intervalCount: (duration: number) => [...intervalDurations.values()].filter(value => value === duration).length,
    intervalCallback: (duration: number) => [...intervals].find(([id]) => intervalDurations.get(id) === duration)?.[1],
    tick(duration: number) { for (const [id, callback] of [...intervals]) if (intervalDurations.get(id) === duration) callback(); },
    setProgress(value: Progress) { progress = { ...value }; },
    progressCalls: () => progressCalls,
    revealCalls: () => revealCalls,
    click(selector: string, finishTransition = true) {
      control(selector).dispatchEvent(new Event('click'));
      if (finishTransition) finishPickerTransition();
    },
    videoClick(target = root, prevented = false) {
      const event = new Event('click', { cancelable: true });
      Object.defineProperty(event, 'target', { value: target });
      if (prevented) event.preventDefault();
      root.dispatchEvent(event);
    },
    submit(url: string, finishTransition = true) {
      control('[data-video-url]').value = url;
      const event = new Event('submit', { cancelable: true });
      control('[data-video-form]').dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
      if (finishTransition) finishPickerTransition();
    },
    escape() {
      const event = new Event('cancel', { cancelable: true });
      control('[data-video-picker]').dispatchEvent(event);
      assert.equal(event.defaultPrevented, true, 'the picker controls whether Escape can dismiss it');
      finishPickerTransition();
      return !control('[data-video-picker]').open;
    },
    price(value: number) { feed.onPrice({ time: 1_000_000, price: value }); },
    state(value: PriceFeedState) { feed.onState(value); },
    currency(value: string) { control('[data-currency]').value = value; control('[data-currency]').dispatchEvent(new Event('change')); },
    visibility(hidden: boolean) { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); },
    emitPlaying: (playing: boolean) => callbacks.onState(playing),
    emitError: (code?: number) => callbacks.onError(code),
    emitBlocked: () => callbacks.onBlocked(),
    emitCaptions: (state: Captions) => callbacks.onCaptions?.(state),
    emitLiveStatus: (id: string, isLive: boolean) => callbacks.onLiveStatus?.(id, isLive),
    playerTitle: () => callbacks.title,
    playCalls: () => playCalls,
    pauseCalls: () => pauseCalls,
    playerDestroys: () => playerDestroys,
    idleEnabled: () => idleEnabled,
    idleStates: () => idleStates,
    controlsDestroys: () => controlsDestroys,
    currencyPickerDestroys: () => currencyPickerDestroys,
    feedStops: () => feedStops,
    reloads: () => reloads,
    saved: () => saved,
    preferences: () => preferences,
    fullscreenRequests: () => fullscreenRequests,
    fullscreenExits: () => fullscreenExits,
    rejectFullscreen() { rejectFullscreen = true; },
    close() { window.dispatchEvent(new Event('pagehide')); },
    async resolveRates(index: number, values: Partial<Record<Currency, number>>) { requests[index].resolve(values); await setImmediate(); },
    async rejectRates(index: number) { requests[index].reject(); await setImmediate(); },
  };
}

test('video submission replaces the picker with playback controls and rejects invalid replacements without changing the background', () => {
  const h = harness();
  assert.equal(h.control('[data-video-url]').disabled, false);
  assert.equal(h.control('[data-load-video]').disabled, false);
  assert.equal(h.playerTitle(), copy.backgroundTitle);
  h.submit('https://example.com/video');
  assert.equal(h.loaded.length, 0);
  assert.equal(h.control('[data-video-url]').attributes.get('aria-invalid'), 'true');
  assert.equal(h.control('[data-video-error]').textContent, copy.invalidUrl);
  assert.equal(h.control('[data-video-error]').hidden, false);
  assert.equal(h.control('[data-video-picker]').open, true);
  assert.equal(h.escape(), true, 'the initial picker can be dismissed without selecting a video');
  assert.equal(h.control('[data-playback-panel]').hidden, true);
  h.click('[data-change-video]');
  h.submit(firstUrl);
  assert.deepEqual(h.loaded, [{ id: 'abcdefghijk', startSeconds: 0 }]);
  assert.equal(h.control('[data-video-url]').attributes.has('aria-invalid'), false);
  assert.equal(h.control('[data-video-picker]').open, false);
  assert.equal(h.control('[data-video-controls]').hidden, false);
  assert.equal(h.control('[data-play-pause]').disabled, false);
  assert.equal(h.control('[data-mute]').disabled, false);
  assert.equal(h.control('[data-video-status]').textContent, copy.loadingVideo);
  assert.equal(h.control('[data-video-status]').hidden, false);
  h.emitPlaying(true);
  h.click('[data-change-video]');
  h.submit('not a video');
  assert.equal(h.loaded.length, 1);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);
  assert.equal(h.pauseCalls(), 0, 'editing or an invalid URL must leave the current video playing');
  h.control('[data-video-url]').dispatchEvent(new Event('input'));
  assert.equal(h.control('[data-video-url]').attributes.has('aria-invalid'), false);
  assert.equal(h.control('[data-video-error]').hidden, true);
  h.submit(secondUrl);
  assert.deepEqual(h.loaded.at(-1), { id: 'ZYXWVUTSRQP', startSeconds: 30 });
  h.close();
});

test('video background and price clicks toggle playback without interfering with editing or controls', () => {
  const h = harness();
  h.videoClick();
  assert.equal(h.playCalls(), 0, 'the initial picker has no video to play');
  h.submit(firstUrl);
  h.emitPlaying(true);
  h.videoClick();
  assert.equal(h.pauseCalls(), 1);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.play);
  h.videoClick();
  assert.equal(h.playCalls(), 1);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);

  const price = Object.assign(new Control(), {
    closest(selectors: string) { return selectors.split(', ').includes('[data-price-position]') ? this : null; },
  });
  h.videoClick(price);
  assert.equal(h.pauseCalls(), 2, 'clicking the price pauses playback');
  h.videoClick(price);
  assert.equal(h.playCalls(), 2, 'clicking the price again resumes playback');
  h.videoClick(price, true);

  for (const selector of ['button', 'input', 'a', '[data-price-style]', '[data-video-form]', '[data-video-controls]']) {
    const target = Object.assign(new Control(), {
      closest(selectors: string) { return selectors.split(', ').includes(selector) ? this : null; },
    });
    h.videoClick(target);
  }
  h.videoClick(h.root, true);
  assert.equal(h.pauseCalls(), 2, 'controls, price dragging, and handled clicks do not pause');
  h.click('[data-change-video]');
  h.videoClick();
  h.videoClick(price);
  assert.equal(h.pauseCalls(), 2, 'editing a replacement URL leaves playback alone');
  h.click('[data-cancel-video]');
  h.emitError(150);
  h.videoClick();
  h.videoClick(price);
  assert.equal(h.playCalls(), 2, 'an unavailable video cannot restart from the background or price');
  h.close();
  h.videoClick();
  assert.equal(h.pauseCalls(), 2);
});

test('play and pause labels follow player state while mute updates its action and icon', () => {
  const h = harness();
  h.submit(firstUrl);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.play);
  assert.equal(h.control('[data-mute]').attributes.get('aria-label'), copy.mute);
  assert.equal(h.control('[data-mute]').attributes.has('aria-pressed'), false);
  h.click('[data-play-pause]');
  assert.equal(h.playCalls(), 1);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);
  assert.equal(h.control('[data-play-pause]').title, copy.pause);
  assert.equal(h.control('[data-play-icon]').attributes.has('hidden'), true);
  assert.equal(h.control('[data-pause-icon]').attributes.has('hidden'), false);
  assert.equal(h.control('[data-video-status]').hidden, true);
  h.click('[data-play-pause]');
  assert.equal(h.pauseCalls(), 1);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.play);
  assert.equal(h.control('[data-play-icon]').attributes.has('hidden'), false);
  assert.equal(h.control('[data-pause-icon]').attributes.has('hidden'), true);
  h.click('[data-mute]');
  assert.deepEqual(h.muted, [false, true]);
  assert.equal(h.control('[data-mute]').attributes.get('aria-label'), copy.unmute);
  assert.equal(h.control('[data-mute]').title, copy.unmute);
  assert.equal(h.control('[data-mute]').attributes.has('aria-pressed'), false);
  assert.equal(h.control('[data-muted-icon]').attributes.has('hidden'), false);
  assert.equal(h.control('[data-sound-icon]').attributes.has('hidden'), true);
  h.click('[data-mute]');
  assert.deepEqual(h.muted, [false, true, false]);
  assert.equal(h.control('[data-mute]').attributes.get('aria-label'), copy.mute);
  assert.equal(h.control('[data-mute]').attributes.has('aria-pressed'), false);
  assert.equal(h.control('[data-muted-icon]').attributes.has('hidden'), true);
  assert.equal(h.control('[data-sound-icon]').attributes.has('hidden'), false);
  h.close();
});

test('a narrow desktop window retains volume and mute controls', () => {
  const h = harness({ viewportWidth: 390, storedPlayback: JSON.stringify({ version: 1, volume: 37, muted: false, lastAudibleVolume: 37 }) });
  h.submit(firstUrl);
  assert.equal(h.volumes.at(-1), 37);
  assert.equal(h.control('[data-video-volume]').disabled, false);
  assert.equal(h.control('[data-mute]').disabled, false);
  h.click('[data-mute]');
  assert.equal(h.muted.at(-1), true);
  h.close();
});

test('mobile playback uses full unmuted sound without overwriting saved desktop audio settings', () => {
  const h = harness({ mobile: true, storedPlayback: JSON.stringify({ version: 1, volume: 37, muted: true, lastAudibleVolume: 37 }) });
  h.submit(firstUrl);
  assert.equal(h.volumes.at(-1), 100);
  assert.equal(h.muted.at(-1), false);
  assert.equal(h.control('[data-video-volume]').disabled, true);
  assert.equal(h.control('[data-mute]').disabled, true);
  h.click('[data-mute]');
  assert.equal(h.muted.at(-1), false);
  h.click('[data-loop]');
  assert.deepEqual(JSON.parse(h.storage.get(videoPlaybackKey)!), {
    version: 1, volume: 37, muted: true, lastAudibleVolume: 37, looping: true,
  });
  h.mobile(false);
  assert.equal(h.volumes.at(-1), 37);
  assert.equal(h.muted.at(-1), true);
  assert.equal(h.control('[data-video-volume]').disabled, false);
  h.close();
});

test('switching to touch input restores full sound and switching back restores desktop audio', () => {
  const h = harness();
  h.submit(firstUrl);
  const volume = h.control('[data-video-volume]');
  volume.value = '24';
  volume.dispatchEvent(new Event('input'));
  h.click('[data-mute]');
  h.mobile(true);
  assert.equal(h.volumes.at(-1), 100);
  assert.equal(h.muted.at(-1), false);
  assert.equal(volume.disabled, true);
  h.submit(secondUrl);
  assert.equal(volume.disabled, true);
  assert.equal(h.playbackAtLoad.at(-1)?.volume, 100);
  h.mobile(false);
  assert.equal(h.volumes.at(-1), 24);
  assert.equal(h.muted.at(-1), true);
  assert.equal(volume.disabled, false);
  h.close();
  const calls = h.volumes.length;
  h.mobile(true);
  assert.equal(h.volumes.length, calls, 'page cleanup releases the responsive audio listener');
});

test('volume starts at full sound, zero mutes, and unmute restores the last audible level', () => {
  const h = harness();
  const volume = h.control('[data-video-volume]');
  const mute = h.control('[data-mute]');
  const inputVolume = (value: string) => { volume.value = value; volume.dispatchEvent(new Event('input')); };
  assert.equal(volume.disabled, true);
  assert.equal(Number(volume.value), 100);
  assert.equal(mute.attributes.get('aria-label'), copy.mute);
  h.submit(firstUrl);
  assert.equal(volume.disabled, false);
  assert.equal(Number(volume.value), 100);
  assert.equal(volume.attributes.get('aria-valuetext'), '100%');
  inputVolume('35');
  assert.equal(h.volumes.at(-1), 35);
  assert.equal(h.muted.at(-1), false);
  assert.equal(volume.attributes.get('aria-valuetext'), '35%');
  inputVolume('0');
  assert.equal(h.volumes.at(-1), 0);
  assert.equal(h.muted.at(-1), true);
  assert.equal(mute.attributes.get('aria-label'), copy.unmute);
  assert.equal(volume.attributes.get('aria-valuetext'), '0%');
  h.click('[data-mute]');
  assert.equal(h.volumes.at(-1), 35);
  assert.equal(h.muted.at(-1), false);
  assert.equal(Number(volume.value), 35);
  assert.equal(mute.attributes.get('aria-label'), copy.mute);
  h.click('[data-mute]');
  assert.equal(h.muted.at(-1), true);
  assert.equal(Number(volume.value), 35, 'mute retains the selected positive volume');
  inputVolume('65');
  assert.equal(h.volumes.at(-1), 65);
  assert.equal(h.muted.at(-1), false, 'raising the slider unmutes the selected level');
  assert.equal(mute.attributes.get('aria-label'), copy.mute);
  h.submit(secondUrl);
  assert.equal(Number(volume.value), 65, 'selecting a new video retains volume');
  assert.equal(mute.attributes.get('aria-label'), copy.mute);
  h.click('[data-mute]');
  h.submit(firstUrl);
  assert.equal(Number(volume.value), 65);
  assert.equal(mute.attributes.get('aria-label'), copy.unmute, 'selection retains an explicitly muted state');
  h.close();
});

test('volume clamps valid values, ignores malformed input, and restores full sound after an initial zero', () => {
  const h = harness();
  h.submit(firstUrl);
  const volume = h.control('[data-video-volume]');
  const inputVolume = (value: string) => { volume.value = value; volume.dispatchEvent(new Event('input')); };
  inputVolume('0');
  h.click('[data-mute]');
  assert.equal(Number(volume.value), 100, 'the initial restore level is full volume');
  assert.equal(h.volumes.at(-1), 100);
  assert.equal(h.muted.at(-1), false);
  inputVolume('250');
  assert.equal(h.volumes.at(-1), 100);
  assert.equal(Number(volume.value), 100);
  inputVolume('49.8');
  assert.equal(h.volumes.at(-1), 50);
  assert.equal(Number(volume.value), 50);
  assert.equal(volume.attributes.get('aria-valuetext'), '50%');
  inputVolume('-20');
  assert.equal(h.volumes.at(-1), 0);
  assert.equal(Number(volume.value), 0);
  assert.equal(h.muted.at(-1), true);
  const volumeCalls = h.volumes.length;
  const muteCalls = h.muted.length;
  inputVolume('not a number');
  assert.equal(h.volumes.length, volumeCalls);
  assert.equal(h.muted.length, muteCalls);
  assert.equal(Number(volume.value), 0);
  assert.equal(volume.attributes.get('aria-valuetext'), '0%');
  h.close();
});

test('volume dragging keeps controls visible and pointer cancellation retains the committed level', () => {
  const h = harness();
  h.submit(firstUrl);
  const volume = h.control('[data-video-volume]');
  volume.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 1 }));
  assert.equal(h.idleEnabled(), false);
  volume.value = '72';
  volume.dispatchEvent(new Event('input'));
  assert.equal(h.volumes.at(-1), 72, 'volume input applies immediately');
  assert.equal(h.idleEnabled(), false);
  h.window.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 1 }));
  assert.equal(h.idleEnabled(), true);
  volume.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 2 }));
  volume.value = '26';
  volume.dispatchEvent(new Event('input'));
  h.window.dispatchEvent(Object.assign(new Event('pointercancel'), { pointerId: 2 }));
  assert.equal(h.idleEnabled(), true);
  assert.equal(Number(volume.value), 26);
  assert.equal(h.volumes.at(-1), 26, 'cancelling the pointer does not undo applied volume');
  h.close();
});

test('change, cancel, and Escape preserve the selected video and return keyboard focus to its controls', () => {
  const h = harness();
  h.submit(firstUrl);
  h.emitPlaying(true);
  h.click('[data-change-video]');
  assert.equal(h.control('[data-video-url]').value, '', 'changing a video opens an empty URL field');
  assert.equal(h.control('[data-video-picker]').open, true);
  assert.equal(h.control('[data-video-controls]').hidden, true);
  assert.equal(h.control('[data-cancel-video]').hidden, false);
  assert.equal(h.control('[data-video-url]').focusCount, 1);
  assert.equal(h.control('[data-video-url]').selectCount, 1);
  h.submit('invalid');
  h.click('[data-cancel-video]');
  assert.equal(h.control('[data-video-picker]').open, false);
  assert.equal(h.control('[data-video-controls]').hidden, false);
  assert.equal(h.control('[data-video-error]').hidden, true);
  assert.equal(h.control('[data-video-url]').attributes.has('aria-invalid'), false);
  assert.equal(h.control('[data-change-video]').focusCount, 2);
  h.click('[data-change-video]');
  assert.equal(h.control('[data-video-url]').value, '', 'reopening after cancelling an invalid URL clears the draft');
  assert.equal(h.escape(), true);
  assert.equal(h.control('[data-video-picker]').open, false);
  assert.equal(h.control('[data-change-video]').focusCount, 3);
  assert.equal(h.loaded.length, 1);
  assert.equal(h.pauseCalls(), 0);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);
  h.click('[data-change-video]');
  h.submit(secondUrl);
  h.emitPlaying(true);
  const previousFocusCount = h.control('[data-video-url]').focusCount;
  h.click('[data-change-video]');
  assert.equal(h.control('[data-video-url]').value, '', 'a newly selected video URL is also cleared when changing again');
  assert.equal(h.control('[data-video-url]').focusCount, previousFocusCount + 1);
  assert.equal(h.control('[data-video-url]').attributes.has('aria-invalid'), false);
  assert.equal(h.control('[data-video-error]').hidden, true);
  assert.equal(h.control('[data-video-error]').attributes.has('data-youtube-error'), false);
  h.click('[data-cancel-video]');
  assert.equal(h.loaded.length, 2, 'opening and cancelling do not reload the background video');
  assert.equal(h.pauseCalls(), 0);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);
  h.close();
});

test('idle hiding starts after video selection and stays disabled while editing or recovering from an error', () => {
  const h = harness();
  assert.equal(h.idleEnabled(), false, 'the initial URL picker must remain visible');
  h.submit('invalid');
  assert.equal(h.idleEnabled(), false);
  h.submit(firstUrl);
  assert.equal(h.idleEnabled(), true);
  h.click('[data-change-video]');
  assert.equal(h.idleEnabled(), false, 'editing a link must keep controls visible');
  h.click('[data-cancel-video]');
  assert.equal(h.idleEnabled(), true);
  h.emitError(150);
  assert.equal(h.idleEnabled(), false, 'error recovery must keep the replacement picker visible');
  h.submit(secondUrl);
  assert.equal(h.idleEnabled(), true);
  h.close();
  h.close();
  assert.equal(h.controlsDestroys(), 1);
  const idleStates = h.idleStates().length;
  h.emitError();
  assert.equal(h.idleStates().length, idleStates, 'late player callbacks cannot change destroyed controls');
});

test('embed errors expose a replacement picker and a blocked autoplay can be resumed with play', () => {
  const h = harness();
  h.submit(firstUrl);
  h.emitPlaying(true);
  h.emitError();
  assert.equal(h.control('[data-video-picker]').open, true);
  assert.equal(h.control('[data-video-url]').value, firstUrl, 'automatic error recovery retains the failed URL');
  assert.equal(h.control('[data-video-error]').hidden, false);
  assert.equal(h.control('[data-video-error]').textContent, copy.videoUnavailable);
  assert.equal(h.control('[data-play-pause]').disabled, true);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.play);
  assert.equal(h.control('[data-cancel-video]').hidden, false, 'error recovery can still be dismissed');
  assert.equal(h.control('[data-video-seek]').disabled, true);
  assert.equal(h.control('[data-video-volume]').disabled, true);
  assert.equal(h.intervalCount(500), 0, 'failed playback must stop progress polling');
  assert.equal(h.escape(), true);
  assert.equal(h.control('[data-playback-panel]').hidden, true, 'failed playback controls stay hidden after dismissal');
  h.click('[data-change-video]');
  h.click('[data-cancel-video]');
  assert.equal(h.control('[data-video-picker]').open, false);
  assert.equal(h.control('[data-video-error]').hidden, true);
  h.visibility(true);
  h.visibility(false);
  assert.equal(h.intervalCount(500), 0, 'returning to a failed video must not restart polling');
  h.click('[data-change-video]');
  h.submit(secondUrl);
  assert.equal(h.control('[data-video-error]').hidden, true);
  assert.equal(h.control('[data-play-pause]').disabled, false);
  assert.equal(h.control('[data-video-volume]').disabled, false);
  assert.equal(h.intervalCount(500), 1, 'a valid replacement restores progress polling');
  h.emitBlocked();
  assert.equal(h.control('[data-video-picker]').open, false);
  assert.equal(h.control('[data-video-status]').textContent, '');
  assert.equal(h.control('[data-video-status]').hidden, true, 'blocked autoplay leaves playback to the play button without a prompt');
  h.click('[data-play-pause]');
  assert.equal(h.playCalls(), 1);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);
  assert.equal(h.control('[data-video-status]').hidden, true);
  h.close();
});

test('owner embedding restrictions explain the failure and successful selection clears YouTube diagnostics', () => {
  const h = harness();
  h.submit(firstUrl);
  for (const code of [101, 150, 100]) {
    h.emitError(code);
    assert.equal(h.control('[data-video-error]').hidden, false);
    assert.equal(h.control('[data-video-error]').textContent, code === 100 ? copy.videoUnavailable : copy.embeddingDisabled);
    assert.equal(h.control('[data-video-error]').attributes.get('data-youtube-error'), String(code));
    assert.equal(h.control('[data-video-picker]').open, true);
    h.submit(secondUrl);
    assert.equal(h.control('[data-video-error]').hidden, true);
    assert.equal(h.control('[data-video-error]').attributes.has('data-youtube-error'), false);
  }
  h.close();
});

test('switching tabs keeps video playing, including delayed playback, without restarting on return', () => {
  const h = harness();
  h.submit(firstUrl);
  h.click('[data-play-pause]');
  h.visibility(true);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.pauseCalls(), 0);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);
  h.emitPlaying(true);
  assert.equal(h.pauseCalls(), 0);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);
  h.visibility(false);
  assert.equal(h.intervalCount(60_000), 1);
  assert.equal(h.intervalCount(500), 1);
  assert.equal(h.playCalls(), 1, 'returning to the tab must not restart playback');
  assert.equal(h.loaded.length, 1);
  h.click('[data-play-pause]');
  assert.equal(h.pauseCalls(), 1, 'explicit pause still works after switching tabs');
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.play);
  h.close();
});

test('switching tabs leaves an explicitly paused video paused', () => {
  const h = harness();
  h.submit(firstUrl);
  h.click('[data-play-pause]');
  h.click('[data-play-pause]');
  h.visibility(true);
  h.visibility(false);
  assert.equal(h.playCalls(), 1);
  assert.equal(h.pauseCalls(), 1);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.play);
  h.close();
});

test('video progress updates while paused and polling stops while hidden and after pagehide', () => {
  const h = harness();
  assert.equal(h.intervalCount(500), 0, 'the initial picker needs no playback polling');
  assert.equal(h.control('[data-video-seek]').disabled, true);
  h.submit(firstUrl);
  assert.equal(h.intervalCount(500), 1);
  assert.equal(h.control('[data-video-seek]').disabled, true, 'seeking waits for duration metadata');
  h.setProgress({ currentTime: 65, duration: 180 });
  h.tick(500);
  assert.equal(h.control('[data-video-current]').textContent, '1:05');
  assert.equal(h.control('[data-video-duration]').textContent, '3:00');
  assert.equal(h.control('[data-video-seek]').disabled, false);
  assert.equal(Number(h.control('[data-video-seek]').max), 180);
  assert.equal(Number(h.control('[data-video-seek]').value), 65);
  assert.match(h.control('[data-video-seek]').attributes.get('aria-valuetext') ?? '', /1:05/);
  assert.match(h.control('[data-video-seek]').attributes.get('aria-valuetext') ?? '', /3:00/);
  assert.equal(h.playCalls(), 0, 'paused playback still exposes its current progress');
  h.setProgress({ currentTime: 90, duration: 180 });
  h.tick(500);
  assert.equal(h.control('[data-video-current]').textContent, '1:30');
  h.visibility(true);
  assert.equal(h.intervalCount(500), 0);
  const hiddenCalls = h.progressCalls();
  h.tick(500);
  assert.equal(h.progressCalls(), hiddenCalls);
  h.setProgress({ currentTime: 120, duration: 180 });
  h.visibility(false);
  assert.equal(h.intervalCount(500), 1);
  assert.equal(h.control('[data-video-current]').textContent, '2:00');
  const stalePoll = h.intervalCallback(500);
  assert.ok(stalePoll);
  h.close();
  assert.equal(h.intervalCount(500), 0);
  const closedCalls = h.progressCalls();
  h.tick(500);
  h.visibility(false);
  assert.equal(h.progressCalls(), closedCalls);
  stalePoll();
  assert.equal(h.progressCalls(), closedCalls);
});

test('range input previews the selected time and change seeks without starting paused playback', () => {
  const h = harness();
  h.submit(firstUrl);
  h.setProgress({ currentTime: 10, duration: 180 });
  h.tick(500);
  const seek = h.control('[data-video-seek]');
  seek.value = '75';
  seek.dispatchEvent(new Event('input'));
  assert.equal(h.control('[data-video-current]').textContent, '1:15');
  assert.match(seek.attributes.get('aria-valuetext') ?? '', /1:15/);
  assert.deepEqual(h.sought, [], 'input previews without committing before change');
  h.setProgress({ currentTime: 11, duration: 180 });
  h.tick(500);
  assert.equal(Number(seek.value), 75, 'a progress poll must not move an actively edited range');
  seek.dispatchEvent(new Event('change'));
  assert.deepEqual(h.sought, [75]);
  assert.equal(h.playCalls(), 0);
  h.setProgress({ currentTime: 76, duration: 180 });
  h.tick(500);
  assert.equal(Number(seek.value), 76, 'polling resumes after the seek commits');
  // Native keyboard navigation emits the same input/change events.
  seek.value = '0';
  seek.dispatchEvent(new Event('input'));
  seek.dispatchEvent(new Event('change'));
  seek.value = '180';
  seek.dispatchEvent(new Event('input'));
  seek.dispatchEvent(new Event('change'));
  assert.deepEqual(h.sought, [75, 0, 180]);
  h.close();
});

test('live videos hide timing and loop controls, and recorded videos restore them', () => {
  const h = harness();
  h.submit(firstUrl);
  h.click('[data-loop]');
  h.setProgress({ currentTime: 120, duration: 180, isLive: true });
  h.tick(500);
  assert.equal(h.control('[data-video-time]').hidden, true);
  assert.equal(h.control('[data-video-timeline]').hidden, true, 'live videos must not show a progress bar');
  assert.equal(h.control('[data-loop]').hidden, true);
  h.setProgress({ currentTime: 125, duration: 180, isLive: false });
  h.tick(500);
  assert.equal(h.control('[data-video-time]').hidden, false);
  assert.equal(h.control('[data-video-timeline]').hidden, false);
  assert.equal(h.control('[data-loop]').hidden, false);
  assert.equal(h.control('[data-loop]').attributes.get('aria-pressed'), 'true', 'live detection must preserve the saved loop preference');
  assert.equal(h.control('[data-video-current]').textContent, '2:05');
  h.setProgress({ currentTime: 130, duration: 190, isLive: true });
  h.tick(500);
  h.click('[data-change-video]');
  h.submit(secondUrl);
  assert.equal(h.control('[data-video-time]').hidden, false, 'a replacement must not inherit the live stream display');
  assert.equal(h.control('[data-video-timeline]').hidden, false);
  assert.equal(h.control('[data-loop]').hidden, false);
  h.close();
});

test('progress handles unknown duration and hour-long videos and constrains seek positions', () => {
  const h = harness();
  h.submit(firstUrl);
  const seek = h.control('[data-video-seek]');
  assert.equal(h.control('[data-video-current]').textContent, '0:00');
  assert.equal(h.control('[data-video-duration]').textContent, '—');
  assert.equal(seek.disabled, true);
  h.setProgress({ currentTime: 4000, duration: 3661 });
  h.tick(500);
  assert.equal(Number(seek.value), 3661);
  assert.equal(h.control('[data-video-current]').textContent, '1:01:01');
  assert.equal(h.control('[data-video-duration]').textContent, '1:01:01');
  h.setProgress({ currentTime: -5, duration: 180 });
  h.tick(500);
  assert.equal(Number(seek.value), 0);
  seek.value = '999';
  seek.dispatchEvent(new Event('input'));
  seek.dispatchEvent(new Event('change'));
  seek.value = '-20';
  seek.dispatchEvent(new Event('input'));
  seek.dispatchEvent(new Event('change'));
  assert.deepEqual(h.sought, [180, 0]);
  h.setProgress({ currentTime: Number.NaN, duration: Number.POSITIVE_INFINITY });
  h.tick(500);
  assert.equal(seek.disabled, true);
  assert.equal(Number(seek.value), 0);
  assert.equal(Number(seek.max), 0);
  assert.equal(h.control('[data-video-duration]').textContent, '—');
  h.close();
});

test('pointer scrubbing keeps controls visible, change commits, and cancellation discards the preview', () => {
  const h = harness();
  h.submit(firstUrl);
  h.setProgress({ currentTime: 10, duration: 180 });
  h.tick(500);
  const seek = h.control('[data-video-seek]');
  seek.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 1 }));
  assert.equal(h.idleEnabled(), false);
  seek.value = '90';
  seek.dispatchEvent(new Event('input'));
  h.setProgress({ currentTime: 11, duration: 180 });
  h.tick(500);
  assert.equal(Number(seek.value), 90);
  assert.equal(h.control('[data-video-current]').textContent, '1:30');
  seek.dispatchEvent(new Event('change'));
  h.window.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 1 }));
  assert.deepEqual(h.sought, [90]);
  assert.equal(h.idleEnabled(), true);
  seek.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 2 }));
  seek.value = '150';
  seek.dispatchEvent(new Event('input'));
  h.setProgress({ currentTime: 92, duration: 180 });
  h.window.dispatchEvent(Object.assign(new Event('pointercancel'), { pointerId: 2 }));
  assert.deepEqual(h.sought, [90], 'a cancelled drag must not seek');
  assert.equal(Number(seek.value), 92);
  assert.equal(h.control('[data-video-current]').textContent, '1:32');
  assert.equal(h.idleEnabled(), true);
  seek.value = '160';
  seek.dispatchEvent(new Event('input'));
  const escape = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
  seek.dispatchEvent(escape);
  assert.deepEqual(h.sought, [90]);
  assert.equal(Number(seek.value), 92);
  assert.equal(h.idleEnabled(), true);
  h.close();
});

test('loop is off by default and toggling it keeps a stable accessible label', () => {
  const h = harness();
  const loop = h.control('[data-loop]');
  assert.equal(loop.attributes.get('aria-pressed'), 'false');
  assert.equal(loop.disabled, true);
  h.submit(firstUrl);
  assert.equal(loop.disabled, false);
  h.click('[data-loop]');
  assert.equal(h.loopStates.at(-1), true);
  assert.equal(loop.attributes.get('aria-pressed'), 'true');
  assert.equal(loop.attributes.get('aria-label'), copy.loop);
  h.submit(secondUrl);
  assert.equal(loop.attributes.get('aria-pressed'), 'true', 'the loop preference survives selecting a different video');
  h.click('[data-loop]');
  assert.equal(h.loopStates.at(-1), false);
  assert.equal(loop.attributes.get('aria-pressed'), 'false');
  assert.equal(loop.attributes.get('aria-label'), copy.loop);
  h.close();
});

test('subtitles stay off across video changes and ignore legacy enabled preferences', () => {
  for (const restored of [false, true]) {
    const h = harness({
      storedSelection: restored ? JSON.stringify({ version: 1, url: firstUrl }) : undefined,
      storedPlayback: JSON.stringify({ version: 1, subtitlesWanted: true }),
    });
    if (!restored) h.submit(firstUrl);
    h.submit(secondUrl);
    assert.deepEqual(h.captionStates, [false]);
    assert.equal(h.playbackAtLoad.length, 2);
    assert.equal(h.playbackAtLoad.every(settings => settings.subtitlesWanted === false), true);
    assert.equal(h.root.controls.has('[data-subtitles]'), false, 'the page never initializes a subtitle toggle');
    h.close();
  }
});

test('Video Mode restores currency and saves changes without altering the shared chart scale', async () => {
  const h = harness({ preferences: { currency: 'EUR', scale: 'linear' }, rates: { EUR: .9, GBP: .75 } });
  assert.equal(h.control('[data-currency]').value, 'EUR');
  assert.equal(h.control('[data-currency]').disabled, false);
  h.state('live');
  h.price(100_000);
  assert.equal(h.control('[data-price]').textContent, '€90,000');
  h.currency('GBP');
  assert.equal(h.control('[data-price]').textContent, '£75,000');
  assert.deepEqual(h.saved(), [{ currency: 'GBP', scale: 'linear' }]);
  h.currency('invalid');
  assert.equal(h.saved().length, 1);
  const restored = harness({ preferences: h.preferences(), rates: { GBP: .75 } });
  assert.equal(restored.control('[data-currency]').value, 'GBP');
  restored.price(100_000);
  assert.equal(restored.control('[data-price]').textContent, '£75,000');
  await h.resolveRates(0, { EUR: .91, GBP: .76 });
  assert.equal(h.control('[data-price]').textContent, '£76,000');
  h.close();
  restored.close();
});

test('unavailable exchange rates keep a dash until rates recover or USD is selected', async () => {
  const h = harness();
  h.price(100_000);
  h.state('live');
  h.currency('JPY');
  assert.equal(h.control('[data-price]').textContent, '—');
  assert.equal(h.control('[data-price]').attributes.get('aria-label'), copy.unavailable);
  assert.equal(h.control('[data-price-status]').textContent, copy.fxLoading);
  await h.rejectRates(0);
  assert.equal(h.control('[data-price]').textContent, '—');
  assert.equal(h.control('[data-price-status]').textContent, copy.fxUnavailable);
  h.currency('USD');
  assert.equal(h.control('[data-price]').textContent, '$100,000');
  assert.equal(h.control('[data-price]').attributes.has('aria-label'), false);
  h.state('offline');
  assert.equal(h.control('[data-price-status]').textContent, copy.offline);
  h.close();
});

test('late exchange-rate results respect the current currency and only repaint a visible page', async () => {
  const current = harness({ preferences: { currency: 'EUR', scale: 'logarithmic' } });
  current.price(100_000);
  current.currency('USD');
  await current.resolveRates(0, { EUR: .9 });
  assert.equal(current.control('[data-price]').textContent, '$100,000');
  current.close();

  const h = harness({ preferences: { currency: 'EUR', scale: 'logarithmic' } });
  h.price(100_000);
  h.visibility(true);
  await h.resolveRates(0, { EUR: .9 });
  assert.equal(h.control('[data-price]').textContent, '—');
  h.visibility(false);
  assert.equal(h.control('[data-price]').textContent, '€90,000');
  h.close();
  await h.resolveRates(1, { EUR: .8 });
  h.price(200_000);
  assert.equal(h.control('[data-price]').textContent, '€90,000');
});

test('pagehide releases the player, feed, listeners, and timers and ignores late player callbacks', () => {
  const h = harness();
  h.submit(firstUrl);
  h.emitPlaying(true);
  h.close();
  h.close();
  assert.equal(h.feedStops(), 1);
  assert.equal(h.playerDestroys(), 1);
  assert.equal(h.controlsDestroys(), 1);
  assert.equal(h.currencyPickerDestroys(), 1);
  assert.equal(h.priceLayoutDestroys(), 1);
  assert.equal(h.intervals.size, 0);
  const pauseCalls = h.pauseCalls();
  const label = h.control('[data-play-pause]').attributes.get('aria-label');
  h.emitPlaying(false);
  h.emitError();
  h.emitBlocked();
  h.visibility(true);
  h.visibility(false);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), label);
  assert.equal(h.control('[data-video-picker]').open, false);
  assert.equal(h.control('[data-video-error]').hidden, true);
  assert.equal(h.control('[data-video-status]').hidden, true);
  assert.equal(h.pauseCalls(), pauseCalls);
  assert.equal(h.intervals.size, 0);
  h.window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  assert.equal(h.reloads(), 1);
});

test('fullscreen controls are hidden when unsupported and reflect entry, exit, and rejection', async () => {
  const unsupported = harness();
  assert.equal(unsupported.control('[data-fullscreen]').hidden, true);
  assert.equal(unsupported.control('[data-fullscreen]').disabled, true);
  unsupported.close();
  const h = harness({ fullscreen: true });
  assert.equal(h.control('[data-fullscreen]').hidden, false);
  assert.equal(h.control('[data-fullscreen]').disabled, false);
  assert.equal(h.control('[data-fullscreen]').attributes.get('aria-label'), copy.fullscreen);
  h.click('[data-fullscreen]');
  assert.equal(h.fullscreenRequests(), 1);
  assert.equal(h.control('[data-fullscreen]').attributes.get('aria-label'), copy.exitFullscreen);
  h.click('[data-fullscreen]');
  assert.equal(h.fullscreenExits(), 1);
  assert.equal(h.control('[data-fullscreen]').attributes.get('aria-label'), copy.fullscreen);
  h.rejectFullscreen();
  h.click('[data-fullscreen]');
  await setImmediate();
  assert.equal(h.control('[data-control-status]').hidden, false);
  assert.equal(h.control('[data-control-status]').textContent, copy.fullscreenUnavailable);
  h.close();
});


test('price layout initializes once after the currency picker and refreshes with rendered prices without changing playback', async () => {
  const h = harness({ rates: { EUR: .9 } });
  assert.deepEqual(h.initializations, ['currencyPicker', 'priceLayout']);
  assert.deepEqual(h.layoutRoots, [h.root]);
  assert.deepEqual(h.layoutRefreshes.at(-1), { price: '—', currency: 'USD' });
  h.submit(firstUrl);
  h.emitPlaying(true);
  h.price(100_000);
  assert.deepEqual(h.layoutRefreshes.at(-1), { price: '$100,000', currency: 'USD' });
  const beforeCurrency = h.layoutRefreshes.length;
  h.currency('EUR');
  assert.ok(h.layoutRefreshes.length > beforeCurrency);
  assert.deepEqual(h.layoutRefreshes.at(-1), { price: '€90,000', currency: 'EUR' });
  await h.resolveRates(0, { EUR: .8 });
  assert.deepEqual(h.layoutRefreshes.at(-1), { price: '€80,000', currency: 'EUR' });
  h.price(250_000);
  assert.deepEqual(h.layoutRefreshes.at(-1), { price: '€200,000', currency: 'EUR' });
  assert.equal(h.layoutRoots.length, 1, 'price and currency updates reuse the existing layout helper');
  assert.equal(h.loaded.length, 1, 'price layout changes must not reload the background video');
  assert.equal(h.playCalls(), 0);
  assert.equal(h.pauseCalls(), 0);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);
  h.close();
});

test('price layout skips hidden paints, refreshes on return, and is destroyed before late feed and rate updates', async () => {
  const h = harness({ preferences: { currency: 'EUR', scale: 'linear' }, rates: { EUR: .9 } });
  h.price(100_000);
  assert.deepEqual(h.layoutRefreshes.at(-1), { price: '€90,000', currency: 'EUR' });
  h.visibility(true);
  const hiddenRefreshes = h.layoutRefreshes.length;
  h.price(120_000);
  await h.resolveRates(0, { EUR: .8 });
  assert.equal(h.layoutRefreshes.length, hiddenRefreshes, 'hidden price updates must not remeasure layout');
  h.visibility(false);
  assert.deepEqual(h.layoutRefreshes.at(-1), { price: '€96,000', currency: 'EUR' });
  const closeRefreshes = h.layoutRefreshes.length;
  h.close();
  h.close();
  assert.equal(h.priceLayoutDestroys(), 1);
  h.price(300_000);
  h.state('offline');
  await h.resolveRates(1, { EUR: .7 });
  h.visibility(false);
  assert.equal(h.layoutRefreshes.length, closeRefreshes, 'destroyed pages must not refresh price layout');
});

test('accepted selections save only the canonical video URL and invalid replacements preserve it', () => {
  const h = harness();
  assert.equal(h.storageWrites.length, 0);
  h.submit(`${secondUrl}&si=private-share-token&list=ignored`);
  const stored = h.storage.get(videoSelectionKey)!;
  assert.deepEqual(JSON.parse(stored), { version: 1, url: canonicalSecondUrl });
  assert.equal(h.control('[data-video-url]').value, canonicalSecondUrl);
  assert.equal(h.control('[data-change-video]').focusCount, 1, 'explicit submission retains its normal focus behavior');
  h.emitPlaying(true);
  h.submit('https://youtube.com.evil.example/watch?v=abcdefghijk');
  assert.equal(h.storage.get(videoSelectionKey), stored);
  assert.equal(h.storageWrites.length, 1);
  assert.equal(h.loaded.length, 1);
  assert.equal(h.pauseCalls(), 0);
  h.click('[data-change-video]');
  assert.equal(h.control('[data-video-url]').value, '', 'remembering a video must not prefill an explicitly opened replacement field');
  assert.equal(h.storage.get(videoSelectionKey), stored);
  h.submit(firstUrl);
  assert.deepEqual(JSON.parse(h.storage.get(videoSelectionKey)!), { version: 1, url: firstUrl });
  assert.equal(h.storageWrites.length, 2);
  assert.equal(h.storageWrites.every(write => write.key === videoSelectionKey), true);
  h.close();
});

test('a saved selection restores playback controls and its requested start without stealing focus or changing currency preferences', () => {
  const storedSelection = JSON.stringify({ version: 1, url: canonicalSecondUrl });
  const h = harness({ storedSelection, preferences: { currency: 'EUR', scale: 'linear' }, rates: { EUR: .9 } });
  assert.deepEqual(h.loaded, [{ id: 'ZYXWVUTSRQP', startSeconds: 30 }]);
  assert.equal(h.control('[data-video-url]').value, canonicalSecondUrl);
  assert.equal(h.control('[data-video-picker]').open, false);
  assert.equal(h.control('[data-video-controls]').hidden, false);
  assert.equal(h.control('[data-play-pause]').disabled, false);
  assert.equal(h.control('[data-video-volume]').disabled, false);
  assert.equal(h.control('[data-video-volume]').value, '100');
  assert.equal(h.control('[data-mute]').attributes.get('aria-label'), copy.mute);
  assert.equal(h.control('[data-video-url]').focusCount, 0);
  assert.equal(h.control('[data-video-url]').selectCount, 0);
  assert.equal(h.control('[data-change-video]').focusCount, 0);
  assert.equal(h.idleEnabled(), true);
  assert.equal(h.intervalCount(500), 1);
  assert.equal(h.storageWrites.length, 0, 'restoring must not write a new selection or playback progress');
  assert.equal(h.control('[data-currency]').value, 'EUR');
  assert.deepEqual(h.preferences(), { currency: 'EUR', scale: 'linear' });
  assert.deepEqual(h.saved(), []);
  assert.deepEqual(h.initializations, ['currencyPicker', 'priceLayout']);
  h.price(100_000);
  assert.equal(h.control('[data-price]').textContent, '€90,000');
  h.close();
});

test('restored videos preserve autoplay recovery and retain the canonical URL if embedding fails', () => {
  const h = harness({ storedSelection: JSON.stringify({ version: 1, url: secondUrl }) });
  h.emitBlocked();
  assert.equal(h.control('[data-video-status]').textContent, '');
  assert.equal(h.control('[data-video-status]').hidden, true);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.play);
  h.click('[data-play-pause]');
  assert.equal(h.playCalls(), 1);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);
  h.emitError(150);
  assert.equal(h.control('[data-video-picker]').open, true);
  assert.equal(h.control('[data-video-url]').value, canonicalSecondUrl);
  assert.equal(h.control('[data-video-error]').textContent, copy.embeddingDisabled);
  assert.equal(h.control('[data-video-url]').focusCount, 0, 'automatic restoration and its failure must not steal focus');
  assert.equal(h.control('[data-video-url]').selectCount, 0);
  h.submit(firstUrl);
  assert.equal(h.control('[data-change-video]').focusCount, 1);
  h.emitError(150);
  assert.equal(h.control('[data-video-url]').focusCount, 1, 'explicit selection keeps the existing error recovery focus');
  h.close();
});

test('malformed, unsupported, and non-YouTube saved values leave an empty usable picker', () => {
  for (const storedSelection of [
    'broken JSON', 'null', '{}', JSON.stringify({ version: 2, url: firstUrl }),
    JSON.stringify({ version: 1, url: null }), JSON.stringify({ version: 1, url: 5 }),
    JSON.stringify({ version: 1, url: 'javascript:alert(1)' }),
    JSON.stringify({ version: 1, url: 'https://example.com/watch?v=abcdefghijk' }),
    JSON.stringify({ version: 1, url: 'https://youtube.com.evil.example/watch?v=abcdefghijk' }),
    JSON.stringify({ version: 1, url: 'https://www.youtube.com/watch?v=invalid' }),
    JSON.stringify({ version: 1, url: 'https://www.youtube.com/playlist?list=abcdefghijk' }),
  ]) {
    const h = harness({ storedSelection });
    assert.equal(h.loaded.length, 0, storedSelection);
    assert.equal(h.control('[data-video-picker]').open, true);
    assert.equal(h.control('[data-video-url]').value, '');
    assert.equal(h.control('[data-video-url]').disabled, false);
    assert.equal(h.control('[data-load-video]').disabled, false);
    assert.equal(h.control('[data-video-url]').focusCount, 0);
    assert.equal(h.storageWrites.length, 0);
    h.close();
  }
});

test('playback settings survive a fresh visit and apply before the saved video loads', () => {
  const h = harness();
  h.submit(secondUrl);
  const volume = h.control('[data-video-volume]');
  volume.value = '37';
  volume.dispatchEvent(new Event('input'));
  h.click('[data-mute]');
  h.click('[data-loop]');
  const storedPlayback = h.storage.get(videoPlaybackKey);
  assert.deepEqual(JSON.parse(storedPlayback!), {
    version: 1, volume: 37, muted: true, lastAudibleVolume: 37, looping: true,
  });
  h.submit(firstUrl);
  assert.equal(h.storage.get(videoPlaybackKey), storedPlayback, 'changing videos preserves playback preferences');
  h.close();

  const restored = harness({ storedSelection: h.storage.get(videoSelectionKey), storedPlayback });
  assert.deepEqual(restored.playbackAtLoad, [{ volume: 37, muted: true, looping: true, subtitlesWanted: false }]);
  assert.equal(restored.control('[data-video-volume]').value, '37');
  assert.equal(restored.control('[data-video-volume]').attributes.get('aria-valuetext'), '37%');
  assert.equal(restored.control('[data-mute]').attributes.get('aria-label'), copy.unmute);
  assert.equal(restored.control('[data-loop]').attributes.get('aria-pressed'), 'true');
  assert.equal(restored.storageWrites.length, 0, 'restoration must not overwrite saved preferences');

  restored.click('[data-mute]');
  restored.click('[data-loop]');
  restored.close();
  const disabled = harness({ storedPlayback: restored.storage.get(videoPlaybackKey) });
  disabled.submit(firstUrl);
  assert.deepEqual(disabled.playbackAtLoad, [{ volume: 37, muted: false, looping: false, subtitlesWanted: false }]);
  assert.equal(disabled.control('[data-loop]').attributes.get('aria-pressed'), 'false');
  assert.equal(disabled.control('[data-mute]').attributes.get('aria-label'), copy.mute);
  disabled.close();
});


test('zero volume and the last audible level survive reopening before another video is selected', () => {
  const h = harness();
  h.submit(firstUrl);
  const volume = h.control('[data-video-volume]');
  for (const value of ['42', '0']) {
    volume.value = value;
    volume.dispatchEvent(new Event('input'));
  }
  h.close();
  const restored = harness({ storedPlayback: h.storage.get(videoPlaybackKey) });
  assert.equal(restored.control('[data-video-volume]').value, '0');
  assert.equal(restored.control('[data-mute]').attributes.get('aria-label'), copy.unmute);
  restored.submit(secondUrl);
  assert.deepEqual(restored.playbackAtLoad, [{ volume: 0, muted: true, looping: false, subtitlesWanted: false }]);
  restored.click('[data-mute]');
  assert.equal(restored.control('[data-video-volume]').value, '42');
  assert.equal(restored.volumes.at(-1), 42);
  assert.equal(restored.muted.at(-1), false);
  assert.deepEqual(JSON.parse(restored.storage.get(videoPlaybackKey)!), {
    version: 1, volume: 42, muted: false, lastAudibleVolume: 42, looping: false,
  });
  restored.close();
});

test('invalid saved playback settings safely retain defaults and a valid video selection', () => {
  for (const storedPlayback of [
    'broken JSON', 'null', '[]', '{}', JSON.stringify({ version: 2, volume: 10, muted: true, looping: true, subtitlesWanted: true }),
    ...[-1, 101, '25', null, {}, []].map(volume => JSON.stringify({
      version: 1, volume, muted: 'true', lastAudibleVolume: 0, looping: 1, subtitlesWanted: 'true',
    })),
  ]) {
    const h = harness({ storedPlayback, storedSelection: JSON.stringify({ version: 1, url: firstUrl }) });
    assert.deepEqual(h.playbackAtLoad, [{ volume: 100, muted: false, looping: false, subtitlesWanted: false }], storedPlayback);
    assert.equal(h.control('[data-video-volume]').value, '100');
    assert.equal(h.control('[data-mute]').attributes.get('aria-label'), copy.mute);
    assert.equal(h.storageWrites.length, 0);
    h.close();
  }
});

test('saved playback fields are validated independently and zero volume always restores muted', () => {
  const h = harness({ storedPlayback: JSON.stringify({ version: 1, volume: 24.6, looping: true, subtitlesWanted: true }) });
  h.submit(firstUrl);
  assert.deepEqual(h.playbackAtLoad, [{ volume: 25, muted: false, looping: true, subtitlesWanted: false }]);
  h.close();
  const zero = harness({ storedPlayback: JSON.stringify({ version: 1, volume: 0, muted: false, lastAudibleVolume: 101 }) });
  zero.submit(firstUrl);
  assert.equal(zero.muted.at(-1), true);
  zero.click('[data-mute]');
  assert.equal(zero.volumes.at(-1), 100, 'an invalid restore level falls back to full volume');
  zero.close();
});

test('blocked local storage does not prevent entering a video, playing, or changing settings', () => {
  const h = harness({ storedSelection: JSON.stringify({ version: 1, url: firstUrl }), blockedStorage: true });
  assert.equal(h.loaded.length, 0, 'an unreadable preference must leave normal selection available');
  h.submit(secondUrl);
  assert.deepEqual(h.loaded, [{ id: 'ZYXWVUTSRQP', startSeconds: 30 }]);
  assert.equal(h.control('[data-video-picker]').open, false);
  assert.equal(h.control('[data-video-error]').hidden, true);
  assert.equal(h.storageWrites.length, 0);
  h.click('[data-play-pause]');
  assert.equal(h.playCalls(), 1);
  h.control('[data-video-volume]').value = '48';
  h.control('[data-video-volume]').dispatchEvent(new Event('input'));
  h.click('[data-mute]');
  h.click('[data-loop]');
  assert.equal(h.volumes.at(-1), 48);
  assert.equal(h.muted.at(-1), true);
  assert.equal(h.loopStates.at(-1), true);
  assert.equal(h.captionStates.at(-1), false);
  assert.equal(h.storageWrites.length, 0);
  h.close();
});

test('a selection restored in a hidden tab can play and keeps its state on return', () => {
  const h = harness({ hidden: true, storedSelection: JSON.stringify({ version: 1, url: canonicalSecondUrl }) });
  assert.deepEqual(h.loaded, [{ id: 'ZYXWVUTSRQP', startSeconds: 30 }]);
  assert.equal(h.pauseCalls(), 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.control('[data-change-video]').focusCount, 0);
  h.emitPlaying(true);
  assert.equal(h.pauseCalls(), 0);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);
  h.visibility(false);
  assert.equal(h.playCalls(), 0);
  assert.equal(h.intervalCount(500), 1);
  assert.equal(h.control('[data-video-url]').focusCount, 0);
  h.click('[data-play-pause]');
  assert.equal(h.playCalls(), 0);
  assert.equal(h.pauseCalls(), 1);
  h.close();
});

test('playback progress is not saved, and a fresh page returns to the submitted URL start', () => {
  const h = harness();
  h.submit(secondUrl);
  h.setProgress({ currentTime: 90, duration: 300 });
  h.tick(500);
  const seek = h.control('[data-video-seek]');
  seek.value = '120';
  seek.dispatchEvent(new Event('input'));
  seek.dispatchEvent(new Event('change'));
  assert.deepEqual(h.sought, [120]);
  assert.equal(h.storageWrites.length, 1);
  const restored = harness({ storedSelection: h.storage.get(videoSelectionKey) });
  assert.deepEqual(restored.loaded, [{ id: 'ZYXWVUTSRQP', startSeconds: 30 }]);
  assert.equal(restored.storageWrites.length, 0);
  h.close(); restored.close();
});

test('destroyed bfcache pages neither restore again nor save stale form submissions', () => {
  const storedSelection = JSON.stringify({ version: 1, url: firstUrl });
  const h = harness({ storedSelection });
  assert.equal(h.loaded.length, 1);
  h.close();
  h.submit(secondUrl);
  h.window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  assert.equal(h.loaded.length, 1);
  assert.equal(h.storage.get(videoSelectionKey), storedSelection);
  assert.equal(h.storageWrites.length, 0);
  assert.equal(h.reloads(), 1);
});


test('the initial drawer shows suggestions and loads every curated video through the normal player flow', () => {
  for (const suggestion of videoSuggestions) {
    const h = harness();
    const picker = h.control('[data-video-picker]');
    assert.equal(picker.open, true);
    assert.equal(picker.showModalCount, 1);
    assert.equal(h.control('[data-video-suggestions]').hidden, false);
    assert.equal(h.idleEnabled(), false, 'the drawer stays visible while choosing');
    assert.equal(h.loaded.length, 0, 'browsing suggestions must not change playback');
    h.click(`[data-video-suggestion="${suggestion.id}"]`);
    assert.deepEqual(h.loaded, [{ id: suggestion.id, startSeconds: 0 }]);
    assert.equal(picker.open, false);
    assert.deepEqual(JSON.parse(h.storage.get(videoSelectionKey)!), { version: 1, url: `https://www.youtube.com/watch?v=${suggestion.id}` });
    h.click('[data-change-video]');
    assert.equal(picker.open, true);
    assert.equal(picker.showModalCount, 2);
    assert.equal(h.control('[data-video-url]').value, '');
    assert.equal(h.control('[data-video-suggestions]').hidden, false, 'Change video immediately shows suggestions again');
    h.close();
  }
});

test('played suggestions join Recent with titles and live status, and resuming playback preserves history', () => {
  const suggestion = videoSuggestions.find(video => video.isLive)!;
  const url = `https://www.youtube.com/watch?v=${suggestion.id}`;
  const h = harness({ realPicker: true });
  h.click(`[data-video-suggestion="${suggestion.id}"]`);
  assert.equal(h.storage.has('obt-video-recents'), false, 'selection alone is not successful playback');
  h.emitLiveStatus(suggestion.id, true);
  h.emitPlaying(true);
  assert.deepEqual(JSON.parse(h.storage.get('obt-video-recents')!), {
    version: 1, urls: [url], titles: { [suggestion.id]: suggestion.title }, live: { [suggestion.id]: true },
  });
  assert.deepEqual(h.rememberedUrls, [url]);
  h.emitPlaying(false);
  h.emitPlaying(true);
  assert.deepEqual(h.rememberedUrls, [url], 'pause and resume must not save or reorder a second time');
  h.click('[data-change-video]');
  assert.equal(h.control('[data-video-tab="recent"]').hidden, false);
  const [load, remove] = h.control('[data-video-recents]').children[0].children;
  assert.equal(load.children[1].textContent, suggestion.title);
  assert.equal(load.children[2].hidden, false);
  h.emitLiveStatus(suggestion.id, false);
  assert.equal(load.children[2].hidden, true, 'the player updates a broadcast that has ended');
  const saved = h.storage.get('obt-video-recents');
  const restored = harness({ realPicker: true, storedRecents: saved });
  assert.equal(restored.control('[data-video-recents]').children[0].children[0].children[2].hidden, true);
  remove.dispatchEvent(new Event('click'));
  h.emitPlaying(false);
  h.emitPlaying(true);
  assert.deepEqual(JSON.parse(h.storage.get('obt-video-recents')!).urls, [], 'resuming a deleted suggestion must not restore it');
  h.close();
  restored.close();
});

test('blocked, failed, and replaced suggestions do not enter Recent before successful playback', () => {
  const h = harness({ realPicker: true });
  h.click(`[data-video-suggestion="${videoSuggestions[0].id}"]`);
  h.emitBlocked();
  assert.equal(h.storage.has('obt-video-recents'), false);
  h.click('[data-change-video]');
  h.click(`[data-video-suggestion="${videoSuggestions[1].id}"]`);
  h.emitError(150);
  h.emitPlaying(true);
  assert.equal(h.storage.has('obt-video-recents'), false, 'a failed suggestion must not survive as pending history');
  h.submit(firstUrl);
  h.emitPlaying(true);
  assert.deepEqual(JSON.parse(h.storage.get('obt-video-recents')!).urls, [firstUrl]);
  h.close();
});

function pickerPointer(h: ReturnType<typeof harness>, type: string, x: number, target = h.control('[data-video-picker]')) {
  const event = Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: 200, button: 0 });
  Object.defineProperty(event, 'target', { value: target });
  let stopped = false;
  event.stopPropagation = () => { stopped = true; };
  h.control('[data-video-picker]').dispatchEvent(event);
  // Mirror bubbling into the page's playback click handler.
  if (type === 'click' && !stopped) h.videoClick(target, event.defaultPrevented);
  return { prevented: event.defaultPrevented, stopped };
}

test('outside clicks slide the picker closed without changing playback, selection, or history', () => {
  for (const reducedMotion of [false, true]) {
    const h = harness({ reducedMotion });
    h.submit(firstUrl);
    h.emitPlaying(true);
    h.click('[data-change-video]');
    const picker = h.control('[data-video-picker]');
    const savedSelection = h.storage.get(videoSelectionKey);
    const writes = h.storageWrites.length;
    const focusCount = h.control('[data-change-video]').focusCount;
    pickerPointer(h, 'pointerdown', 800);
    assert.deepEqual(pickerPointer(h, 'click', 800), { prevented: true, stopped: true });
    assert.equal(picker.open, !reducedMotion);
    assert.equal(picker.attributes.has('data-closing'), !reducedMotion);
    assert.equal(h.control('[data-change-video]').attributes.get('aria-expanded'), 'false');
    if (!reducedMotion) {
      assert.equal(h.control('[data-change-video]').focusCount, focusCount);
      h.finishPickerTransition();
    }
    assert.equal(picker.open, false);
    assert.equal(h.control('[data-change-video]').focusCount, focusCount + 1);
    assert.equal(h.idleEnabled(), true);
    assert.equal(h.pauseCalls(), 0);
    assert.equal(h.playCalls(), 0);
    assert.equal(h.loaded.length, 1);
    assert.equal(h.storage.get(videoSelectionKey), savedSelection);
    assert.equal(h.storageWrites.length, writes);
    h.close();
  }
});

test('picker content and drags crossing its edge do not dismiss it; the initial picker also supports outside dismissal', () => {
  const h = harness();
  const picker = h.control('[data-video-picker]');
  for (const [start, end, target] of [
    [100, 100, picker], // Empty panel padding targets the dialog itself.
    [100, 800, picker], // Dragging a selection out of the URL field.
    [800, 100, picker],
    [800, 800, h.control('[data-video-form]')],
  ] as const) {
    pickerPointer(h, 'pointerdown', start, target);
    pickerPointer(h, 'click', end, target);
    assert.equal(picker.open, true);
    assert.equal(picker.attributes.has('data-closing'), false);
  }
  pickerPointer(h, 'pointerdown', 800);
  pickerPointer(h, 'click', 800);
  assert.equal(picker.attributes.has('data-closing'), true);
  h.finishPickerTransition();
  assert.equal(picker.open, false);
  assert.equal(h.loaded.length, 0);
  assert.equal(h.control('[data-playback-panel]').hidden, true);
  h.close();
  pickerPointer(h, 'pointerdown', 800);
  assert.deepEqual(pickerPointer(h, 'click', 800), { prevented: false, stopped: false }, 'cleanup removes backdrop listeners');
});

test('URL submission, suggestions, and the initial close button keep the drawer rendered until its exit completes', () => {
  for (const action of ['url', 'suggestion', 'close']) {
    const h = harness();
    const picker = h.control('[data-video-picker]');
    if (action === 'url') h.submit(firstUrl, false);
    else h.click(action === 'suggestion' ? `[data-video-suggestion="${videoSuggestions[0].id}"]` : '[data-cancel-video]', false);
    assert.equal(picker.open, true, 'the dialog must remain rendered for the exit animation');
    assert.equal(picker.attributes.has('data-closing'), true);
    assert.equal(h.control('[data-video-controls]').hidden, false, 'controls can fade in during the slide out');
    assert.equal(h.control('[data-playback-panel]').hidden, action === 'close');
    assert.equal(h.control('[data-change-video]').focusCount, 0, 'focus stays inside the modal until it closes');
    assert.equal(h.idleEnabled(), false);
    h.finishPickerTransition();
    assert.equal(picker.open, false);
    assert.equal(picker.attributes.has('data-closing'), false);
    assert.equal(h.timeouts.size, 0);
    assert.equal(h.control('[data-change-video]').focusCount, 1);
    h.click('[data-change-video]');
    assert.equal(picker.open, true);
    h.close();
  }
});

test('loading waits for the exit, previous player errors cannot interrupt it, and reduced motion closes without waiting', () => {
  const h = harness();
  h.submit(firstUrl, false);
  assert.equal(h.loaded.length, 0, 'iframe work waits until the slide out has finished');
  assert.deepEqual(h.rememberedUrls, [firstUrl], 'history must be saved before the slide out finishes');
  h.emitError(150);
  h.finishPickerTransition();
  assert.equal(h.control('[data-video-picker]').open, false, 'an old player error must not interrupt the replacement');
  assert.equal(h.loaded.length, 1);
  assert.deepEqual(h.rememberedUrls, [firstUrl]);
  h.emitError(150);
  assert.equal(h.control('[data-video-picker]').open, true, 'errors from the replacement still reopen recovery');
  assert.equal(h.control('[data-video-picker]').attributes.has('data-closing'), false);
  assert.equal(h.control('[data-video-error]').hidden, false);
  assert.equal(h.timeouts.size, 0);
  h.click('[data-cancel-video]', false);
  const fallback = [...h.timeouts.values()][0];
  fallback();
  assert.equal(h.control('[data-video-picker]').open, false, 'closing finishes even if no transition event arrives');
  h.click('[data-change-video]');
  h.click('[data-cancel-video]', false);
  h.close();
  assert.equal(h.timeouts.size, 0, 'cleanup cancels the pending exit');

  const reduced = harness({ reducedMotion: true });
  reduced.click('[data-cancel-video]', false);
  assert.equal(reduced.control('[data-video-picker]').open, false);
  assert.equal(reduced.timeouts.size, 0);
  reduced.close();
});

test('only submitted URLs are remembered, using canonical URLs without share parameters', () => {
  const h = harness();
  h.submit(`${secondUrl}&si=ignored`);
  assert.deepEqual(h.rememberedUrls, [canonicalSecondUrl]);
  h.click('[data-change-video]');
  h.submit('https://example.com/not-youtube');
  assert.deepEqual(h.rememberedUrls, [canonicalSecondUrl]);
  h.click(`[data-video-suggestion="${videoSuggestions[0].id}"]`);
  assert.deepEqual(h.rememberedUrls, [canonicalSecondUrl], 'suggestion clicks do not add URLs to the entered history');
  h.close();
  h.close();
  assert.equal(h.pickerTabDestroys(), 1);
  const restored = harness({ storedSelection: JSON.stringify({ version: 1, url: firstUrl }) });
  assert.deepEqual(restored.rememberedUrls, [], 'restoring playback does not rewrite history');
  restored.close();
});

test('the real picker saves submitted URLs before animation or playback and restores them after reload', () => {
  const h = harness({ realPicker: true });
  h.submit(`${secondUrl}&si=ignored`, false);
  assert.equal(h.loaded.length, 0, 'playback can wait for the animation');
  const saved = h.storage.get('obt-video-recents');
  assert.ok(saved, 'an accepted URL must already be saved before the drawer finishes closing');
  assert.deepEqual(JSON.parse(saved), { version: 1, urls: [canonicalSecondUrl] });
  h.close();

  const restored = harness({ realPicker: true, storedRecents: saved, storedSelection: h.storage.get(videoSelectionKey) });
  restored.click('[data-change-video]');
  assert.equal(restored.control('[data-video-tab="recent"]').hidden, false);
  assert.equal(restored.control('[data-video-panel="recent"]').hidden, false);
  const list = restored.control('[data-video-recents]');
  assert.equal(list.children[0].children[0].dataset.recentVideo, canonicalSecondUrl);
  list.children[0].children[1].dispatchEvent(new Event('click'));
  assert.deepEqual(JSON.parse(restored.storage.get('obt-video-recents')!), { version: 1, urls: [] });
  assert.equal(restored.control('[data-video-tab="recent"]').hidden, true);
  restored.close();
});

test('Escape dismisses the whole drawer and preserves playback and keyboard focus', () => {
  const h = harness();
  h.submit(firstUrl);
  h.emitPlaying(true);
  h.click('[data-change-video]');
  assert.equal(h.control('[data-change-video]').attributes.get('aria-expanded'), 'true');
  assert.equal(h.escape(), true);
  assert.equal(h.control('[data-video-picker]').open, false);
  assert.equal(h.control('[data-change-video]').attributes.get('aria-expanded'), 'false');
  assert.equal(h.control('[data-change-video]').focusCount, 2);
  assert.equal(h.loaded.length, 1);
  assert.equal(h.pauseCalls(), 0);
  assert.equal(h.playCalls(), 0);
  h.click('[data-change-video]');
  h.click('[data-cancel-video]');
  assert.equal(h.control('[data-video-picker]').open, false);
  h.click('[data-change-video]');
  h.close();
  assert.equal(h.control('[data-video-picker]').open, false, 'cleanup removes the open modal');
  h.click('[data-change-video]');
  h.click(`[data-video-suggestion="${videoSuggestions[0].id}"]`);
  assert.equal(h.control('[data-video-picker]').open, false);
  assert.equal(h.loaded.length, 1, 'stale controls must not load videos after cleanup');
});

test('suggestions have unique validated video IDs and consistent translated controls in every locale', () => {
  assert.equal(new Set(videoSuggestions.map(suggestion => suggestion.id)).size, videoSuggestions.length);
  for (const suggestion of videoSuggestions) {
    assert.ok(suggestion.title.trim());
    assert.deepEqual(parseYouTubeVideo(`https://www.youtube.com/watch?v=${suggestion.id}`), { id: suggestion.id, startSeconds: 0 });
  }
  const keys = Object.keys(videoCopy.en).sort();
  for (const translation of Object.values(videoCopy)) {
    assert.deepEqual(Object.keys(translation).sort(), keys);
    for (const key of ['pickVideo', 'recentTab', 'partyTab', 'chillTab', 'withoutSoundTab', 'removeRecent', 'recentTitleLoading', 'recentTitleUnavailable'] as const) assert.ok(translation[key].trim());
  }
});


test('curated sections preserve existing recordings, move live videos to Chill, and include every requested addition', () => {
  const sections = Object.fromEntries(videoSections.map(section => [section.id, section.videos]));
  assert.deepEqual(Object.keys(sections), ['party', 'chill', 'without-sound']);
  assert.deepEqual(sections.party.map(video => video.id), ['EFDMum1vs7Q', 'ez8m4PXksQs', '_yRJsecDjjc', 'G1IbRujko-A']);
  assert.deepEqual(sections.chill.map(video => video.id), ['2QWVZkuTU4s', 'vYIYIVmOo3Q', 'yf5NOyy1SXU', 'TGysUwc_LEc', 'zBRFf8gAsR8', 'vKG91INzLt0', 'mSX3OyW9Rao', '784dsKVrdjQ']);
  assert.ok(sections.chill.slice(0, -3).every(video => video.isLive));
  assert.ok(sections.chill.slice(-3).every(video => !video.isLive), 'the Zelda, fireplace, and black hole recordings must not gain Live badges when moved');
  assert.ok(sections.party.every(video => !video.isLive));
  assert.deepEqual(sections['without-sound'].map(video => video.id), ['vx5AZDbSY1g', 'mgqIPHwwfyM', 'X3BT2eCleOE', 'FwIHSDiFye8', 'kiNSWFEyDQM', '7d5pgfsSug0', '5mGuCdlCcNM', 'A07HjYnbAQQ', 'YIZkCUFU9Oc', '-sOAzvbWgnk']);
  assert.ok(sections['without-sound'].every(video => !video.isLive));
  for (const translation of Object.values(videoCopy)) {
    for (const section of videoSections) assert.ok(translation[section.labelKey].trim());
  }
});
