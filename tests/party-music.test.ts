import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { createPartyPlaylist, PartyPlaybackState } from '../src/lib/party-music.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/party-music.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

type PendingPlay = { resolve(): void; reject(error: Error): void; src: string };

function harness({ webAudio = true, deferPlay = false, resumeFails = false, loadFails = false } = {}) {
  const states: PartyPlaybackState[] = [];
  const errors: string[] = [];
  const analysers: unknown[] = [];
  const urls: { url: string; file: File }[] = [];
  const revoked: string[] = [];
  const plays: PendingPlay[] = [];
  const contexts: Context[] = [];
  const calls: string[] = [];
  class Audio extends EventTarget {
    src = '';
    paused = true;
    ended = false;
    error: unknown = null;
    autoplay = true;
    loop = true;
    preload = '';
    loads = 0;
    play() {
      calls.push('play');
      this.paused = false;
      this.ended = false;
      this.dispatchEvent(new Event('play'));
      return new Promise<void>((resolve, reject) => {
        plays.push({ resolve, reject, src: this.src });
        if (!deferPlay) resolve();
      });
    }
    pause() {
      const wasPlaying = !this.paused;
      this.paused = true;
      if (wasPlaying) this.dispatchEvent(new Event('pause'));
    }
    load() {
      this.loads++; this.paused = true; this.ended = false; this.error = null;
      if (loadFails) throw new Error('media unavailable');
    }
    removeAttribute(name: string) { if (name === 'src') this.src = ''; }
    finish() { this.paused = true; this.ended = true; this.dispatchEvent(new Event('ended')); }
    fail() { this.error = { code: 4 }; this.dispatchEvent(new Event('error')); }
  }
  class Node {
    connected: unknown[] = [];
    disconnected = 0;
    connect(target: unknown) { this.connected.push(target); }
    disconnect() { this.disconnected++; }
  }
  class Context {
    state = 'suspended';
    destination = {};
    analyser = Object.assign(new Node(), { fftSize: 0, smoothingTimeConstant: 0, minDecibels: 0, maxDecibels: 0 });
    source = new Node();
    sourceCount = 0;
    resumes = 0;
    closed = 0;
    constructor() { contexts.push(this); calls.push('context'); }
    createAnalyser() { return this.analyser; }
    createMediaElementSource(element: Audio) {
      assert.equal(element, audio);
      this.sourceCount++;
      return this.source;
    }
    resume() {
      calls.push('resume');
      this.resumes++;
      if (resumeFails) return Promise.reject(new Error('blocked'));
      this.state = 'running';
      return Promise.resolve();
    }
    close() { this.closed++; this.state = 'closed'; return Promise.resolve(); }
  }
  const audio = new Audio();
  const module: { createPartyPlaylist?: typeof createPartyPlaylist } = {};
  runInNewContext(script, {
    exports: module, AudioContext: webAudio ? Context : undefined,
    URL: {
      createObjectURL(file: File) {
        const url = `blob:track-${urls.length + 1}`;
        urls.push({ url, file });
        return url;
      },
      revokeObjectURL(url: string) { revoked.push(url); },
    },
  });
  const playlist = module.createPartyPlaylist!(audio as unknown as HTMLAudioElement, {
    onState: state => { calls.push('state'); states.push({ ...state }); },
    onError: error => { calls.push(error); errors.push(error); },
    onAnalyser: analyser => analysers.push(analyser),
  });
  const state = () => states.at(-1)!;
  const select = (...files: File[]) => playlist.selectFiles(files);
  return { playlist, audio, contexts, urls, revoked, states, state, errors, analysers, plays, calls, select };
}

const file = (name: string, type = '') => new File([], name, { type });
const tracks = () => [file('track-a.mp3', 'audio/mpeg'), file('track-b.wav', 'audio/wav'), file('track-c.ogg', 'audio/ogg')];

test('selection preserves file order, accepts audio MIME or unknown audio extensions, and never autoplays', () => {
  const h = harness();
  assert.equal(h.state().hasTracks, false);
  assert.equal(h.state().trackIndex, -1);
  const accepted = [file('first.custom', 'audio/mpeg'), file('second.MP3'), file('third.flac', 'application/octet-stream')];
  assert.equal(h.select(accepted[0], file('image.mp3', 'image/png'), accepted[1], file('video.webm', 'video/webm'), accepted[2], file('notes.txt')), true);
  assert.deepEqual(h.state(), {
    hasTracks: true, playing: false, canPrevious: false, canNext: true,
    trackName: 'first.custom', trackIndex: 0, trackCount: 3,
  });
  assert.equal(h.urls.length, 1);
  assert.equal(h.urls[0].file, accepted[0]);
  assert.equal(h.plays.length, 0);
  assert.equal(h.contexts.length, 0);
  h.playlist.next();
  assert.equal(h.state().trackName, 'second.MP3');
  h.playlist.next();
  assert.equal(h.state().trackName, 'third.flac');
  assert.equal(h.state().playing, false);
  assert.equal(h.plays.length, 0);
  assert.deepEqual(h.revoked, ['blob:track-1', 'blob:track-2']);
  h.playlist.destroy();
});

test('cancelled and invalid selection preserve the previous playlist and current URL', () => {
  const h = harness();
  h.select(...tracks());
  h.playlist.next();
  const before = h.state();
  const url = h.audio.src;
  assert.equal(h.select(), false);
  assert.equal(h.select(file('notes.txt', 'text/plain'), file('cover.png', 'image/png')), false);
  assert.equal(h.state(), before);
  assert.equal(h.audio.src, url);
  assert.equal(h.urls.length, 2);
  assert.deepEqual(h.errors, ['unsupportedFiles']);
  h.playlist.destroy();
});

test('Play creates and resumes one audible analyser graph inside the gesture, and Pause follows media state', async () => {
  const h = harness();
  h.select(...tracks());
  const pending = h.playlist.toggle();
  assert.deepEqual(h.calls.filter(call => ['context', 'resume', 'play'].includes(call)), ['context', 'resume', 'play']);
  await pending;
  const context = h.contexts[0];
  assert.equal(context.analyser.fftSize, 2048);
  assert.equal(context.analyser.smoothingTimeConstant, 0.25);
  assert.equal(context.analyser.minDecibels, -85);
  assert.equal(context.analyser.maxDecibels, -5);
  assert.deepEqual(context.source.connected, [context.analyser]);
  assert.deepEqual(context.analyser.connected, [context.destination]);
  assert.equal(h.analysers[0], context.analyser);
  assert.equal(h.state().playing, true);
  await h.playlist.toggle();
  assert.equal(h.audio.paused, true);
  assert.equal(h.state().playing, false);
  await h.playlist.toggle();
  h.playlist.next();
  await setImmediate();
  assert.equal(h.state().playing, true);
  assert.equal(h.state().trackIndex, 1);
  assert.equal(h.contexts.length, 1);
  assert.equal(context.sourceCount, 1);
  h.audio.pause();
  assert.equal(h.state().playing, false);
  h.playlist.next();
  assert.equal(h.plays.length, 3);
  assert.equal(h.state().playing, false);
  h.playlist.destroy();
});

test('ended tracks advance automatically in order and the playlist stops at its last track', async () => {
  const h = harness();
  h.select(...tracks());
  h.playlist.previous();
  assert.equal(h.urls.length, 1);
  await h.playlist.toggle();
  h.audio.finish();
  await setImmediate();
  assert.equal(h.state().trackIndex, 1);
  assert.equal(h.state().playing, true);
  assert.equal(h.state().canPrevious, true);
  h.audio.finish();
  await setImmediate();
  assert.equal(h.state().trackIndex, 2);
  assert.equal(h.state().canNext, false);
  h.playlist.next();
  assert.equal(h.plays.length, 3);
  h.audio.finish();
  assert.equal(h.state().playing, false);
  assert.equal(h.state().trackIndex, 2);
  assert.equal(h.plays.length, 3);
  assert.deepEqual(h.revoked, ['blob:track-1', 'blob:track-2']);
  h.playlist.previous();
  assert.equal(h.state().trackIndex, 1);
  assert.equal(h.state().playing, false);
  h.playlist.destroy();
});

test('single-track playlists have no previous or next and can replay after ending', async () => {
  const h = harness();
  h.select(file('song.mp3'));
  assert.equal(h.state().canPrevious, false);
  assert.equal(h.state().canNext, false);
  await h.playlist.toggle();
  h.audio.finish();
  assert.equal(h.state().playing, false);
  await h.playlist.toggle();
  assert.equal(h.state().playing, true);
  assert.equal(h.plays.length, 2);
  h.playlist.destroy();
});

test('unsupported or corrupt audio stops playback, reports a failure, and permits skipping', async () => {
  const h = harness({ deferPlay: true });
  h.select(...tracks());
  const pending = h.playlist.toggle();
  h.plays[0].reject(new Error('unsupported codec'));
  await pending;
  assert.deepEqual(h.errors, ['playbackFailed']);
  assert.equal(h.state().playing, false);
  assert.deepEqual(h.calls.slice(-2), ['state', 'playbackFailed']);
  h.playlist.next();
  assert.equal(h.state().trackIndex, 1);
  assert.equal(h.plays.length, 1);
  const next = h.playlist.toggle();
  h.plays[1].resolve();
  await next;
  h.audio.fail();
  assert.equal(h.state().playing, false);
  assert.deepEqual(h.errors, ['playbackFailed', 'playbackFailed']);
  h.playlist.next();
  assert.equal(h.state().trackIndex, 2);
  h.playlist.destroy();
});

test('a stale play rejection cannot stop a newer track or overwrite its playback state', async () => {
  const h = harness({ deferPlay: true });
  h.select(...tracks());
  const oldPlay = h.playlist.toggle();
  h.playlist.next();
  assert.equal(h.plays.length, 2);
  h.plays[1].resolve();
  await setImmediate();
  h.plays[0].reject(new Error('source changed'));
  await oldPlay;
  assert.equal(h.state().playing, true);
  assert.equal(h.state().trackIndex, 1);
  assert.deepEqual(h.errors, []);
  // A queued pause/error belonging to the previous source is harmless.
  h.audio.dispatchEvent(new Event('pause'));
  h.audio.dispatchEvent(new Event('error'));
  assert.equal(h.state().playing, true);
  assert.deepEqual(h.errors, []);
  h.playlist.destroy();
});

test('a media loading failure reports recovery only after publishing the stopped state', () => {
  const h = harness({ loadFails: true });
  h.select(file('song.mp3'));
  assert.equal(h.state().playing, false);
  assert.deepEqual(h.calls.slice(-2), ['state', 'playbackFailed']);
  assert.deepEqual(h.errors, ['playbackFailed']);
  h.playlist.destroy();
});

test('a pending Play is cancelled by Pause or playlist replacement without late autoplay or errors', async () => {
  const h = harness({ deferPlay: true });
  h.select(...tracks());
  const first = h.playlist.toggle();
  await h.playlist.toggle();
  h.plays[0].resolve();
  await first;
  assert.equal(h.state().playing, false);
  const second = h.playlist.toggle();
  h.select(file('replacement.mp3'));
  h.plays[1].reject(new Error('old source aborted'));
  await second;
  assert.equal(h.state().trackName, 'replacement.mp3');
  assert.equal(h.state().playing, false);
  assert.deepEqual(h.errors, []);
  assert.equal(h.contexts.length, 1);
  h.playlist.destroy();
});

test('audio still plays without Web Audio and reports the unavailable visualizer once', async () => {
  const h = harness({ webAudio: false });
  h.select(...tracks());
  await h.playlist.toggle();
  assert.equal(h.state().playing, true);
  assert.deepEqual(h.errors, ['visualizerUnavailable']);
  assert.deepEqual(h.analysers, [undefined]);
  await h.playlist.toggle();
  await h.playlist.toggle();
  assert.deepEqual(h.errors, ['visualizerUnavailable']);
  h.playlist.destroy();
});

test('a failed AudioContext resume does not report silent playback as successful', async () => {
  const h = harness({ resumeFails: true });
  h.select(...tracks());
  await h.playlist.toggle();
  assert.equal(h.state().playing, false);
  assert.equal(h.audio.paused, true);
  assert.deepEqual(h.errors, ['playbackFailed']);
  h.playlist.destroy();
});

test('destroy releases the active URL and audio graph and prevents late work', async () => {
  const h = harness({ deferPlay: true });
  h.select(...tracks());
  const pending = h.playlist.toggle();
  h.playlist.destroy();
  const stateCount = h.states.length;
  assert.equal(h.audio.src, '');
  assert.equal(h.audio.paused, true);
  assert.deepEqual(h.revoked, ['blob:track-1']);
  assert.equal(h.contexts[0].closed, 1);
  assert.equal(h.contexts[0].source.disconnected, 1);
  assert.equal(h.contexts[0].analyser.disconnected, 1);
  assert.equal(h.analysers.at(-1), undefined);
  h.plays[0].reject(new Error('navigation aborted playback'));
  await pending;
  h.audio.finish();
  h.audio.fail();
  h.playlist.next();
  h.playlist.previous();
  await h.playlist.toggle();
  assert.equal(h.select(file('new.mp3')), false);
  h.playlist.destroy();
  assert.equal(h.states.length, stateCount);
  assert.equal(h.urls.length, 1);
  assert.equal(h.plays.length, 1);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.revoked, ['blob:track-1']);
});
