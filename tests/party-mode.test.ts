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
import type { PartyPlaybackState } from '../src/lib/party-music.ts';
import { party } from '../src/i18n/party.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/scripts/party-mode.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const copy = {
  unavailable: 'Price unavailable', connecting: 'Connecting', live: 'Live', delayed: 'Reconnecting', offline: 'Offline',
  loadingPrice: 'Waiting for price', fxLoading: 'Loading exchange rate', fxUnavailable: 'Exchange rate unavailable',
  play: 'Play', pause: 'Pause', previousTrack: 'Previous track', nextTrack: 'Next track',
  musicLabel: 'Your soundtrack', nowPlaying: 'Track {index} of {count}: {name}',
  unsupportedFiles: 'Choose audio files', playbackFailed: 'Track could not play', visualizerUnavailable: 'Visualization unavailable',
  fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', fullscreenUnavailable: 'Fullscreen unavailable',
};

class Control extends EventTarget {
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  controls = new Map<string, Control>();
  style = { values: new Map<string, string>(), setProperty(name: string, value: string) { this.values.set(name, value); } };
  textContent = '—';
  hidden = false;
  files: File[] = [];
  clicks = 0;
  click() { this.clicks++; }
  disabled = false;
  value = '';
  title = '';
  focusCount = 0;
  querySelector(selector: string): Control {
    if (!this.controls.has(selector)) this.controls.set(selector, new Control());
    return this.controls.get(selector)!;
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  toggleAttribute(name: string, force: boolean) { if (force) this.attributes.set(name, ''); else this.attributes.delete(name); }
  focus() { this.focusCount++; }
}

interface Options {
  locale?: string;
  preferences?: DisplayPreferences;
  rates?: Partial<Record<Currency, number>>;
  hidden?: boolean;
}

function harness(options: Options = {}) {
  const root = new Control();
  root.dataset = { copy: JSON.stringify(copy), locale: options.locale ?? 'en-US' };
  root.querySelector('[data-playback-controls]').hidden = true;
  root.querySelector('[data-music-error]').hidden = true;
  root.querySelector('[data-currency]').disabled = true;
  root.querySelector('[data-music-files]').disabled = true;
  root.querySelector('[data-choose-files]').disabled = true;
  const document = Object.assign(new EventTarget(), {
    hidden: options.hidden ?? false, fullscreenEnabled: false, fullscreenElement: null,
    querySelector: () => root,
  });
  let reloads = 0;
  const window = Object.assign(new EventTarget(), {
    location: { reload() { reloads++; } },
  });
  const navigator = { onLine: true };
  let preferences: DisplayPreferences = { ...options.preferences ?? { currency: 'USD', scale: 'logarithmic' } };
  const saved: DisplayPreferences[] = [];
  const rates = new Map<Currency, number>();
  for (const [currency, rate] of Object.entries(options.rates ?? {})) rates.set(currency as Currency, rate!);
  const requests: { resolve: (values: Partial<Record<Currency, number>>) => void; reject: () => void }[] = [];
  const intervals = new Map<number, () => void>();
  let timerId = 0;
  let feed: { onPrice: (point: HistoryPoint) => void; onState: (state: PriceFeedState) => void } | undefined;
  let feedStops = 0;
  const playing: boolean[] = [];
  const analysers: unknown[] = [];
  const controlPlaying: boolean[] = [];
  let controlDestroys = 0;
  let visualizerDestroys = 0;
  let playlistDestroys = 0;
  const selected: File[][] = [];
  let playback: PartyPlaybackState = { hasTracks: false, playing: false, canPrevious: false, canNext: false, trackName: '', trackIndex: -1, trackCount: 0 };
  let callbacks: { onState(state: PartyPlaybackState): void; onError(error: 'unsupportedFiles' | 'playbackFailed' | 'visualizerUnavailable'): void; onAnalyser(value: unknown): void };
  const updatePlayback = (changes: Partial<PartyPlaybackState>) => {
    playback = { ...playback, ...changes };
    playback.canPrevious = playback.trackIndex > 0;
    playback.canNext = playback.trackIndex >= 0 && playback.trackIndex < playback.trackCount - 1;
    callbacks.onState(playback);
  };
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
        reject: () => reject(new Error('Rates unavailable')),
      }));
    }
  }
  const modules = {
    CurrencyRates: Rates,
    isCurrency: (value: string) => ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY'].includes(value),
    readDisplayPreferences: () => ({ ...preferences }),
    saveDisplayPreferences: (next: DisplayPreferences) => { preferences = { ...next }; saved.push({ ...next }); },
    subscribeBitcoinPrice: (callbacks: typeof feed) => {
      feed = callbacks;
      callbacks!.onState('connecting');
      return () => { feedStops++; };
    },
    createPartyPlaylist: (_audio: unknown, input: typeof callbacks) => {
      callbacks = input;
      callbacks.onState(playback);
      return {
        selectFiles(files: File[]) {
          if (files.some(file => !file.name.endsWith('.wav'))) { callbacks.onError('unsupportedFiles'); return false; }
          selected.push(files);
          updatePlayback({ hasTracks: true, playing: false, trackIndex: 0, trackCount: files.length, trackName: files[0].name });
          return true;
        },
        async toggle() { updatePlayback({ playing: !playback.playing }); },
        previous() { if (playback.canPrevious) updatePlayback({ trackIndex: playback.trackIndex - 1, trackName: selected.at(-1)![playback.trackIndex - 1].name }); },
        next() { if (playback.canNext) updatePlayback({ trackIndex: playback.trackIndex + 1, trackName: selected.at(-1)![playback.trackIndex + 1].name }); },
        destroy() { playlistDestroys++; },
      };
    },
    createPartyControls: () => ({ setPlaying: (value: boolean) => controlPlaying.push(value), destroy: () => { controlDestroys++; } }),
    createPartyVisualizer: () => ({ setPlaying: (value: boolean) => playing.push(value), setAnalyser: (value: unknown) => analysers.push(value), destroy: () => { visualizerDestroys++; } }),
  };
  runInNewContext(script, {
    require: () => modules, exports: {}, document, window, navigator, Intl,
    setInterval: (callback: () => void) => { intervals.set(++timerId, callback); return timerId; },
    clearInterval: (id: number) => intervals.delete(id),
  });
  return {
    root, requests, intervals, playing, analysers, controlPlaying, window, selected,
    control: (selector: string) => root.querySelector(selector),
    price(value: number) { feed!.onPrice({ time: 1_000_000, price: value }); },
    state(value: PriceFeedState) { feed!.onState(value); },
    currency(value: string) { const control = root.querySelector('[data-currency]'); control.value = value; control.dispatchEvent(new Event('change')); },
    visibility(hidden: boolean) { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); },
    select(files: File[]) {
      const input = root.querySelector('[data-music-files]');
      input.files = files;
      input.dispatchEvent(new Event('change'));
    },
    playback: () => playback,
    emitPlayback: updatePlayback,
    emitError: (error: Parameters<typeof callbacks.onError>[0]) => callbacks.onError(error),
    attachAnalyser: (value: unknown) => callbacks.onAnalyser(value),
    playlistDestroys: () => playlistDestroys,
    controlDestroys: () => controlDestroys,
    saved: () => saved,
    preferences: () => preferences,
    feedStops: () => feedStops,
    visualizerDestroys: () => visualizerDestroys,
    reloads: () => reloads,
    close() { window.dispatchEvent(new Event('pagehide')); },
    async resolveRates(index: number, values: Partial<Record<Currency, number>>) { requests[index].resolve(values); await setImmediate(); },
    async rejectRates(index: number) { requests[index].reject(); await setImmediate(); },
  };
}

for (const locale of Object.keys(party)) {
  test(`Party Mode uses currency symbols and localized numbers in ${locale}`, () => {
    const h = harness({
      locale,
      preferences: { currency: 'AUD', scale: 'linear' },
      rates: { EUR: 1, GBP: 1, AUD: 1, CAD: 1, CHF: 1, JPY: 1 },
    });
    const symbols: Record<Currency, string> = {
      USD: '$', EUR: '€', GBP: '£', AUD: '$', CAD: '$', CHF: 'CHF', JPY: locale === 'ja' ? '￥' : '¥',
    };
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: true });
    const checkPrice = (currency: Currency, amount: number) => {
      const rendered = h.control('[data-price]').textContent;
      assert.ok(rendered.includes(symbols[currency]), `${locale}/${currency}: ${rendered}`);
      assert.equal(rendered.replace(symbols[currency], '').trim(), number.format(amount), `${locale}/${currency}/${amount}`);
      if ((locale === 'es' || locale === 'it') && amount === 9000) assert.match(rendered, /9\.000/);
    };
    h.price(9000);
    checkPrice('AUD', 9000);
    for (const currency of Object.keys(symbols) as Currency[]) {
      h.currency(currency);
      for (const amount of [900, 1000, 9000, 9999, 10_000, 123_456.4]) {
        h.price(amount);
        checkPrice(currency, amount);
      }
    }
    h.close();
  });
}

test('Party Mode restores currency and saves changes without altering the chart scale', async () => {
  const h = harness({ preferences: { currency: 'EUR', scale: 'linear' }, rates: { EUR: .9, GBP: .75 } });
  assert.equal(h.control('[data-currency]').value, 'EUR');
  assert.equal(h.control('[data-currency]').disabled, false);
  h.state('live');
  h.price(100_000);
  assert.equal(h.control('[data-price]').textContent, '€90,000');
  assert.equal(h.control('[data-currency-note]').hidden, false);
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

test('unavailable FX shows a dash and does not present USD as the selected currency', async () => {
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
  assert.equal(h.control('[data-currency-note]').hidden, true);
  h.state('offline');
  assert.equal(h.control('[data-price-status]').textContent, copy.offline);
  h.close();
});

test('late FX results use the current currency and cannot paint a hidden or destroyed page', async () => {
  const current = harness({ preferences: { currency: 'EUR', scale: 'logarithmic' } });
  current.price(100_000);
  current.currency('USD');
  await current.resolveRates(0, { EUR: .9 });
  assert.equal(current.control('[data-price]').textContent, '$100,000');
  current.close();

  const hidden = harness({ preferences: { currency: 'EUR', scale: 'logarithmic' } });
  hidden.price(100_000);
  hidden.visibility(true);
  assert.equal(hidden.intervals.size, 0);
  await hidden.resolveRates(0, { EUR: .9 });
  assert.equal(hidden.control('[data-price]').textContent, '—');
  hidden.visibility(false);
  assert.equal(hidden.control('[data-price]').textContent, '€90,000');
  assert.equal(hidden.intervals.size, 1);
  hidden.close();
  await hidden.resolveRates(1, { EUR: .8 });
  hidden.price(200_000);
  assert.equal(hidden.control('[data-price]').textContent, '€90,000');
});

test('file selection hides the picker and exposes only the applicable playback controls', () => {
  const h = harness();
  assert.equal(h.control('[data-music-files]').disabled, false);
  assert.equal(h.control('[data-choose-files]').disabled, false);
  assert.equal(h.control('[data-playback-controls]').hidden, true);
  h.control('[data-choose-files]').dispatchEvent(new Event('click'));
  assert.equal(h.control('[data-music-files]').clicks, 1);
  h.select([]);
  assert.equal(h.selected.length, 0);
  h.select([new File(['audio'], 'first.wav')]);
  assert.equal(h.control('[data-music-chooser]').hidden, true);
  assert.equal(h.control('[data-playback-controls]').hidden, false);
  assert.equal(h.control('[data-previous-track]').hidden, true);
  assert.equal(h.control('[data-next-track]').hidden, true);
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.play);
  assert.equal(h.control('[data-play-pause]').focusCount, 1);
  assert.equal(h.control('[data-music-files]').value, '');
  h.close();
});

test('playlist controls reflect play/pause and track boundaries and drive the audio visualizer', () => {
  const h = harness();
  h.select([new File(['audio'], 'first.wav'), new File(['audio'], 'second.wav')]);
  assert.equal(h.playback().playing, false);
  assert.equal(h.control('[data-previous-track]').hidden, false);
  assert.equal(h.control('[data-previous-track]').disabled, true);
  assert.equal(h.control('[data-next-track]').disabled, false);
  const analyser = {};
  h.attachAnalyser(analyser);
  assert.equal(h.analysers.at(-1), analyser);
  h.control('[data-play-pause]').dispatchEvent(new Event('click'));
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.pause);
  assert.equal(h.control('[data-audio-play-icon]').attributes.has('hidden'), true);
  assert.equal(h.playing.at(-1), true);
  assert.equal(h.controlPlaying.at(-1), true);
  h.control('[data-next-track]').dispatchEvent(new Event('click'));
  assert.equal(h.control('[data-next-track]').disabled, true);
  assert.equal(h.control('[data-previous-track]').disabled, false);
  assert.equal(h.control('[data-music-status]').textContent, 'Track 2 of 2: second.wav');
  h.control('[data-previous-track]').dispatchEvent(new Event('click'));
  assert.equal(h.control('[data-music-status]').textContent, 'Track 1 of 2: first.wav');
  h.control('[data-play-pause]').dispatchEvent(new Event('click'));
  assert.equal(h.control('[data-play-pause]').attributes.get('aria-label'), copy.play);
  assert.equal(h.playing.at(-1), false);
  assert.equal(h.controlPlaying.at(-1), false);
  h.close();
});

test('file and playback errors retain controls and allow choosing replacement music', () => {
  const h = harness();
  h.select([new File(['audio'], 'first.wav')]);
  h.select([new File(['no audio'], 'notes.txt')]);
  assert.equal(h.selected.length, 1);
  assert.equal(h.control('[data-music-chooser]').hidden, false);
  assert.equal(h.control('[data-music-error]').hidden, false);
  assert.equal(h.control('[data-music-error]').textContent, copy.unsupportedFiles);
  h.select([new File(['audio'], 'replacement.wav')]);
  assert.equal(h.control('[data-music-error]').hidden, true);
  assert.equal(h.control('[data-music-chooser]').hidden, true);
  h.emitError('playbackFailed');
  h.emitPlayback({ playing: false });
  assert.equal(h.control('[data-music-chooser]').hidden, false);
  assert.equal(h.control('[data-music-error]').textContent, copy.playbackFailed);
  h.close();
});

test('hidden tabs retain audio playback and pagehide releases the feed, playlist, visualizer, and timers', () => {
  const h = harness();
  h.select([new File(['audio'], 'first.wav')]);
  h.control('[data-play-pause]').dispatchEvent(new Event('click'));
  h.visibility(true);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.playback().playing, true);
  h.visibility(false);
  assert.equal(h.intervals.size, 1);
  h.close();
  h.close();
  assert.equal(h.feedStops(), 1);
  assert.equal(h.playlistDestroys(), 1);
  assert.equal(h.controlDestroys(), 1);
  assert.equal(h.visualizerDestroys(), 1);
  assert.equal(h.intervals.size, 0);
  const count = h.playing.length;
  h.emitPlayback({ playing: true });
  h.visibility(false);
  assert.equal(h.playing.length, count);
  assert.equal(h.intervals.size, 0);
  h.window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  assert.equal(h.reloads(), 1);
});
