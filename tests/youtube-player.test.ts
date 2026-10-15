import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { parseYouTubeVideo } from '../src/lib/youtube-player.ts';
import type { createYouTubePlayer } from '../src/lib/youtube-player.ts';

const VIDEO = 'dQw4w9WgXcQ';
const SECOND = 'M7lc1UVf-VE';
const script = ts.transpileModule(readFileSync(new URL('../src/lib/youtube-player.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test('YouTube URLs accept watch, short links, Shorts, live, and privacy-enhanced embeds', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${VIDEO}&list=ignored`,
    `https://m.youtube.com/watch?v=${VIDEO}`,
    `https://music.youtube.com/watch?v=${VIDEO}`,
    `https://youtu.be/${VIDEO}?si=ignored`,
    `youtube.com/watch?v=${VIDEO}`,
    `//www.youtube.com/shorts/${VIDEO}`,
    `https://www.youtube.com/live/${VIDEO}`,
    `https://www.youtube.com/embed/${VIDEO}`,
    `https://www.youtube-nocookie.com/embed/${VIDEO}`,
  ]) assert.deepEqual(parseYouTubeVideo(url), { id: VIDEO, startSeconds: 0 }, url);
});

test('YouTube starts preserve shared seconds and duration timestamps without carrying arbitrary URL parameters', () => {
  for (const [suffix, startSeconds] of [
    ['?t=90', 90], ['?t=90s', 90], ['?t=1m30s', 90], ['?t=1h2m3s', 3723],
    ['?start=17&t=90', 17], ['#t=45s', 45], ['?t=0', 0], ['?t=4.9', 4],
    ['?t=-4', 0], ['?t=bogus', 0], ['?t=Infinity', 0], ['?t=99999999999999999999', 0],
  ] as const) assert.deepEqual(parseYouTubeVideo(`https://youtu.be/${VIDEO}${suffix}`), { id: VIDEO, startSeconds });
});

test('YouTube parser rejects unrelated origins, disguised hosts, credentials, unsafe protocols, and invalid video IDs', () => {
  for (const url of [
    '', VIDEO, `https://youtube.com.evil.example/watch?v=${VIDEO}`,
    `https://evil.example/youtube.com/watch?v=${VIDEO}`, `https://youtube.com@evil.example/watch?v=${VIDEO}`,
    `https://name@www.youtube.com/watch?v=${VIDEO}`, `https://youtube.com:8443/watch?v=${VIDEO}`,
    `javascript:alert('${VIDEO}')`, `ftp://youtube.com/watch?v=${VIDEO}`,
    `https://www.youtube.com/playlist?list=${VIDEO}`, `https://youtu.be/${VIDEO}/extra`,
    'https://youtube.com/watch?v=bad', `https://youtube-nocookie.com/watch?v=${VIDEO}`,
    'https://www.youtube.com/embed/%22%3E%3Cscript', `https://www.youtube.com/channel/${VIDEO}`,
  ]) assert.equal(parseYouTubeVideo(url), undefined, url);
});

function harness({ apiAvailable = false, constructorFails = false } = {}) {
  const timers = new Map<number, () => void>();
  let timerId = 0;
  class Element extends EventTarget {
    attributes = new Map<string, string>();
    children: Element[] = [];
    parent?: Element;
    src = '';
    async = false;
    title = '';
    referrerPolicy = '';
    tabIndex = 0;
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    hasAttribute(name: string) { return this.attributes.has(name); }
    append(child: Element) { child.parent = this; this.children.push(child); }
    replaceChildren(...children: Element[]) { this.children = children; for (const child of children) child.parent = this; }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = undefined;
    }
  }
  const head = new Element();
  const document = {
    head,
    createElement() { return new Element(); },
    querySelector() { return head.children.find(child => child.src === 'https://www.youtube.com/iframe_api') ?? null; },
  };
  const players: Player[] = [];
  type PlayerOptions = {
    host: string; width: string; height: string; playerVars: Record<string, string | number>;
    events: Record<string, (event: { target: Player; data?: number }) => void>;
  };
  class Player {
    iframe = new Element();
    calls: { name: string; volume?: number; request?: { videoId: string; startSeconds: number } }[] = [];
    currentTime = 42;
    duration = 300;
    seekCalls: { seconds: number; allowSeekAhead: boolean }[] = [];
    captionCalls: string[] = [];
    captionOptions: { module: string; option: string; value: unknown }[] = [];
    modules: string[] = [];
    tracks: unknown = [{ languageCode: 'en' }];
    options: PlayerOptions;
    constructor(mount: Element, options: PlayerOptions) {
      this.options = options;
      if (constructorFails) throw new Error('Player construction failed');
      mount.parent?.replaceChildren(this.iframe);
      players.push(this);
    }
    loadVideoById(request: { videoId: string; startSeconds: number }) { this.calls.push({ name: 'load', request: { ...request } }); }
    cueVideoById(request: { videoId: string; startSeconds: number }) { this.calls.push({ name: 'cue', request: { ...request } }); }
    playVideo() { this.calls.push({ name: 'play' }); }
    pauseVideo() { this.calls.push({ name: 'pause' }); }
    getCurrentTime() { return this.currentTime; }
    getDuration() { return this.duration; }
    seekTo(seconds: number, allowSeekAhead: boolean) {
      this.seekCalls.push({ seconds, allowSeekAhead }); this.currentTime = seconds;
    }
    getOptions() { return this.modules; }
    getOption() { return this.tracks; }
    setOption(module: string, option: string, value: unknown) { this.captionOptions.push({ module, option, value }); }
    loadModule(module: string) { this.captionCalls.push(`load:${module}`); }
    unloadModule(module: string) { this.captionCalls.push(`unload:${module}`); }
    setVolume(volume: number) { this.calls.push({ name: 'volume', volume }); }
    mute() { this.calls.push({ name: 'mute' }); }
    unMute() { this.calls.push({ name: 'unmute' }); }
    getIframe() { return this.iframe; }
    destroy() { this.calls.push({ name: 'destroy' }); this.iframe.remove(); }
    event(name: string, data?: number) { this.options.events[name]({ target: this, data }); }
  }
  type WindowWithApi = {
    location: { origin: string }; onYouTubeIframeAPIReady?: () => void;
    YT?: { Player: typeof Player };
  };
  const window: WindowWithApi = { location: { origin: 'https://example.test' } };
  if (apiAvailable) window.YT = { Player };
  const module: { createYouTubePlayer?: typeof createYouTubePlayer } = {};
  runInNewContext(script, {
    exports: module, window, document, URL, URLSearchParams,
    setTimeout(callback: () => void) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id: number) { timers.delete(id); },
  });
  const states: boolean[] = [];
  const errors: string[] = [];
  const errorCodes: (number | undefined)[] = [];
  const captions: { enabled: boolean; available: boolean }[] = [];
  const container = new Element();
  const controller = module.createYouTubePlayer!(container as unknown as HTMLElement, {
    title: 'Video background',
    onState: playing => states.push(playing), onError: code => { errors.push('error'); errorCodes.push(code); },
    onReady: () => errors.push('ready'), onBlocked: () => errors.push('blocked'),
    onCaptions: state => captions.push({ ...state }),
  });
  const makeController = () => module.createYouTubePlayer!(new Element() as unknown as HTMLElement, {
    onState() {}, onError() {},
  });
  return {
    controller, container, states, errors, errorCodes, captions, head, players, timers, window, makeController,
    readyApi() { window.YT = { Player }; window.onYouTubeIframeAPIReady?.(); },
    failScript() { head.children[0].dispatchEvent(new Event('error')); },
    expireTimers() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
  };
}

const first = { id: VIDEO, startSeconds: 42 };
const second = { id: SECOND, startSeconds: 0 };

async function readyPlayer(h: ReturnType<typeof harness>) {
  h.controller.load(first);
  h.readyApi();
  await setImmediate();
  h.players[0].event('onReady');
  return h.players[0];
}

test('player waits for explicit selection, shares one API request, and applies the latest queued video', async () => {
  const h = harness();
  assert.deepEqual(h.states, [false]);
  assert.equal(h.head.children.length, 0);
  const other = h.makeController();
  h.controller.load(first);
  other.load(first);
  h.controller.load(second);
  assert.equal(h.head.children.length, 1);
  assert.equal(h.players.length, 0);
  h.readyApi();
  await setImmediate();
  assert.equal(h.players.length, 2);
  const player = h.players[0];
  player.event('onReady');
  assert.deepEqual(player.calls, [{ name: 'volume', volume: 100 }, { name: 'unmute' }, { name: 'load', request: { videoId: SECOND, startSeconds: 0 } }]);
  assert.equal(player.iframe.title, 'Video background');
  assert.equal(player.iframe.referrerPolicy, 'strict-origin-when-cross-origin');
  assert.equal(player.iframe.tabIndex, -1);
  assert.equal(player.options.playerVars.origin, 'https://example.test');
  assert.equal(player.options.playerVars.controls, 0);
  assert.equal(player.options.playerVars.disablekb, 1);
  assert.equal(player.options.playerVars.playsinline, 1);
  assert.equal(player.options.playerVars.cc_load_policy, 0);
  assert.equal(h.timers.size, 1); // The second player has not become ready yet.
  h.controller.destroy(); other.destroy();
  assert.equal(h.timers.size, 0);
});

test('pause before API readiness cues the selection and playback state follows actual player events', async () => {
  const h = harness();
  h.controller.load(first);
  h.controller.pause();
  h.readyApi();
  await setImmediate();
  const player = h.players[0];
  player.event('onReady');
  assert.deepEqual(player.calls, [{ name: 'volume', volume: 100 }, { name: 'unmute' }, { name: 'cue', request: { videoId: VIDEO, startSeconds: 42 } }]);
  h.controller.play();
  assert.equal(h.states.at(-1), false);
  player.event('onStateChange', 1);
  assert.equal(h.states.at(-1), true);
  h.controller.pause();
  assert.equal(player.calls.at(-1)?.name, 'pause');
  assert.equal(h.states.at(-1), false);
  player.event('onStateChange', 1); // A late playing event cannot undo Pause.
  assert.equal(player.calls.at(-1)?.name, 'pause');
  assert.equal(h.states.at(-1), false);
  h.controller.destroy();
});

test('background appears only after sustained playback and hides during buffering, pause, and end', async () => {
  const h = harness();
  const visible = () => h.container.hasAttribute('data-video-visible');
  const player = await readyPlayer(h);
  assert.equal(visible(), false);
  player.event('onStateChange', 1);
  assert.equal(h.states.at(-1), true); // Our controls respond without the visual delay.
  assert.equal(visible(), false);
  h.expireTimers();
  assert.equal(visible(), true);

  player.event('onStateChange', 3);
  assert.equal(visible(), false);
  assert.equal(h.states.at(-1), true); // Buffering retains the Pause action.
  player.event('onStateChange', 1);
  h.expireTimers();
  assert.equal(visible(), true);

  h.controller.pause();
  assert.equal(visible(), false); // Hide before YouTube sends its paused event.
  player.event('onStateChange', 2);
  h.controller.play();
  assert.equal(visible(), false);
  player.event('onStateChange', 1);
  h.expireTimers();
  assert.equal(visible(), true);
  player.event('onStateChange', 0);
  assert.equal(visible(), false);
  h.controller.destroy();
});

test('interrupted playback cancels the background reveal, including replacement, failure, and cleanup', async () => {
  for (const interrupt of ['pause', 'buffer', 'load', 'blocked', 'error', 'destroy'] as const) {
    const h = harness();
    const player = await readyPlayer(h);
    player.event('onStateChange', 1);
    assert.equal(h.timers.size, 1);
    if (interrupt === 'pause') h.controller.pause();
    if (interrupt === 'buffer') player.event('onStateChange', 3);
    if (interrupt === 'load') h.controller.load(second);
    if (interrupt === 'blocked') player.event('onAutoplayBlocked');
    if (interrupt === 'error') player.event('onError', 150);
    if (interrupt === 'destroy') h.controller.destroy();
    assert.equal(h.timers.size, 0, interrupt);
    h.expireTimers();
    assert.equal(h.container.hasAttribute('data-video-visible'), false, interrupt);
    h.controller.destroy();
  }
});

test('mute preferences survive video changes, and explicitly looping videos restart at zero', async () => {
  const h = harness({ apiAvailable: true });
  h.controller.setMuted(false);
  const player = await readyPlayer(h);
  assert.deepEqual(player.calls.slice(0, 2), [{ name: 'volume', volume: 100 }, { name: 'unmute' }]);
  h.controller.setLoop(true);
  player.event('onStateChange', 1);
  player.event('onStateChange', 0);
  assert.deepEqual(player.seekCalls.at(-1), { seconds: 0, allowSeekAhead: true });
  assert.equal(player.calls.at(-1)?.name, 'play');
  h.controller.load(second);
  assert.equal(player.calls.at(-2)?.name, 'unmute');
  h.controller.setMuted(true);
  assert.equal(player.calls.at(-1)?.name, 'mute');
  h.controller.destroy();
});

test('blocked playback remains stopped until Play and embedding errors allow selecting another video', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  player.event('onAutoplayBlocked');
  assert.equal(h.states.at(-1), false);
  assert.deepEqual(h.errors, ['ready', 'blocked']);
  const before = player.calls.length;
  player.event('onStateChange', 0);
  assert.equal(player.calls.length, before);
  h.controller.play();
  assert.equal(player.calls.at(-1)?.name, 'play');
  player.event('onStateChange', 1);
  player.event('onError', 150);
  assert.equal(h.states.at(-1), false);
  assert.equal(h.errors.at(-1), 'error');
  h.controller.load(second);
  assert.deepEqual(player.calls.at(-1), { name: 'load', request: { videoId: SECOND, startSeconds: 0 } });
  h.controller.destroy();
});

test('API script failures and timeouts clean up the loader and permit retries', async () => {
  for (const failure of ['error', 'timeout']) {
    const h = harness();
    h.controller.load(first);
    if (failure === 'error') h.failScript(); else h.expireTimers();
    await setImmediate();
    assert.deepEqual(h.errors, ['error']);
    assert.deepEqual(h.errorCodes, [undefined]);
    assert.equal(h.head.children.length, 0);
    assert.equal(h.timers.size, 0);
    h.controller.load(second);
    assert.equal(h.head.children.length, 1);
    h.readyApi();
    await setImmediate();
    h.players[0].event('onReady');
    assert.deepEqual(h.players[0].calls.at(-1), { name: 'load', request: { videoId: SECOND, startSeconds: 0 } });
    h.controller.destroy();
  }
});

test('an iframe readiness timeout removes the broken player and ignores its late events after retry', async () => {
  const h = harness({ apiAvailable: true });
  h.controller.load(first);
  await setImmediate();
  const stale = h.players[0];
  h.expireTimers();
  assert.equal(stale.calls.at(-1)?.name, 'destroy');
  assert.deepEqual(h.errors, ['error']);
  h.controller.load(second);
  await setImmediate();
  const player = h.players[1];
  player.event('onReady');
  player.event('onStateChange', 1);
  const stateCount = h.states.length;
  stale.event('onReady'); stale.event('onStateChange', 2); stale.event('onError', 150); stale.event('onAutoplayBlocked');
  assert.equal(h.states.length, stateCount);
  assert.deepEqual(h.errors, ['error', 'ready']);
  assert.deepEqual(player.calls.at(-1), { name: 'load', request: { videoId: SECOND, startSeconds: 0 } });
  h.controller.destroy();
});

test('destroy cancels pending setup and suppresses all late player callbacks and further operations', async () => {
  const h = harness();
  h.controller.load(first);
  h.controller.destroy();
  h.readyApi();
  await setImmediate();
  assert.equal(h.players.length, 0);
  assert.equal(h.timers.size, 0);

  const live = harness();
  const player = await readyPlayer(live);
  live.controller.destroy();
  const states = live.states.length;
  player.event('onReady'); player.event('onStateChange', 1); player.event('onError', 150); player.event('onAutoplayBlocked');
  live.controller.load(second); live.controller.play(); live.controller.pause(); live.controller.setMuted(false); live.controller.destroy();
  assert.equal(live.states.length, states);
  assert.deepEqual(live.errors, ['ready']);
  assert.equal(player.calls.filter(call => call.name === 'destroy').length, 1);
  assert.equal(live.container.children.length, 0);
  assert.equal(live.timers.size, 0);
});

test('construction failures report stopped playback without leaving an iframe readiness timer', async () => {
  const h = harness({ apiAvailable: true, constructorFails: true });
  h.controller.load(first);
  await setImmediate();
  assert.deepEqual(h.errors, ['error']);
  assert.equal(h.states.at(-1), false);
  assert.equal(h.container.children.length, 0);
  assert.equal(h.timers.size, 0);
  h.controller.destroy();
});


test('a failed iframe before readiness releases resources without a duplicate timeout error', async () => {
  const h = harness({ apiAvailable: true });
  h.controller.load(first);
  await setImmediate();
  const stale = h.players[0];
  stale.event('onError', 153);
  assert.equal(stale.calls.at(-1)?.name, 'destroy');
  assert.equal(h.timers.size, 0);
  h.expireTimers();
  stale.event('onReady');
  assert.deepEqual(h.errors, ['error']);
  h.controller.load(second);
  await setImmediate();
  h.players[1].event('onReady');
  assert.equal(h.errors.at(-1), 'ready');
  h.controller.destroy();
});


test('retry preserves chosen mute and a pause during retry prevents late autoplay', async () => {
  const h = harness({ apiAvailable: true });
  h.controller.setMuted(false);
  h.controller.load(first);
  await setImmediate();
  h.players[0].event('onError', 153);
  h.controller.load(second);
  h.controller.pause(); // The page can become hidden while an iframe is loading.
  await setImmediate();
  const player = h.players[1];
  player.event('onReady');
  assert.deepEqual(player.calls, [
    { name: 'volume', volume: 100 },
    { name: 'unmute' },
    { name: 'cue', request: { videoId: SECOND, startSeconds: 0 } },
  ]);
  player.event('onStateChange', 1);
  assert.equal(player.calls.at(-1)?.name, 'pause');
  assert.equal(h.states.includes(true), false);
  h.players[0].event('onReady');
  h.players[0].event('onStateChange', 1);
  assert.equal(h.states.includes(true), false);
  h.controller.destroy();
});


test('YouTube embedding errors preserve numeric diagnostics before and after player readiness', async () => {
  for (const code of [100, 101, 150, 153]) {
    for (const ready of [false, true]) {
      const h = harness({ apiAvailable: true });
      h.controller.load(first);
      await setImmediate();
      const player = h.players[0];
      if (ready) player.event('onReady');
      player.event('onError', code);
      assert.deepEqual(h.errorCodes, [code]);
      assert.equal(h.states.at(-1), false);
      h.controller.destroy();
    }
  }
});

test('malformed player diagnostics never propagate non-numeric or non-finite error values', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  for (const code of [undefined, NaN, Infinity, '150']) {
    player.event('onError', code as number | undefined);
  }
  assert.deepEqual(h.errorCodes, [undefined, undefined, undefined, undefined]);
  h.controller.destroy();
});

test('progress readings remain finite and clamp missing, invalid, and out-of-range metadata', async () => {
  const h = harness();
  assert.deepEqual({ ...h.controller.getProgress() }, { currentTime: 0, duration: 0 });
  const player = await readyPlayer(h);
  assert.deepEqual({ ...h.controller.getProgress() }, { currentTime: 42, duration: 300 });
  player.currentTime = 500;
  assert.deepEqual({ ...h.controller.getProgress() }, { currentTime: 300, duration: 300 });
  player.currentTime = -10;
  assert.equal(h.controller.getProgress().currentTime, 0);
  player.currentTime = NaN;
  assert.equal(h.controller.getProgress().currentTime, 0);
  for (const duration of [NaN, Infinity, -1, 0]) {
    player.duration = duration;
    assert.deepEqual({ ...h.controller.getProgress() }, { currentTime: 0, duration: 0 });
  }
  player.getDuration = () => { throw new Error('Not ready'); };
  assert.deepEqual({ ...h.controller.getProgress() }, { currentTime: 0, duration: 0 });
  assert.deepEqual(h.errorCodes, []);
  h.controller.destroy();
});

test('seeking clamps to video bounds, ignores invalid inputs, and preserves paused playback', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  player.event('onStateChange', 1);
  h.controller.seekTo(95.5);
  assert.deepEqual(player.seekCalls.at(-1), { seconds: 95.5, allowSeekAhead: true });
  assert.equal(player.calls.some(call => call.name === 'pause'), false);
  h.controller.seekTo(-5);
  assert.equal(player.seekCalls.at(-1)?.seconds, 0);
  h.controller.seekTo(999);
  assert.equal(player.seekCalls.at(-1)?.seconds, 300);
  const seeks = player.seekCalls.length;
  for (const invalid of [NaN, Infinity, -Infinity]) h.controller.seekTo(invalid);
  assert.equal(player.seekCalls.length, seeks);
  h.controller.pause();
  h.controller.seekTo(70);
  assert.equal(player.calls.at(-1)?.name, 'pause');
  assert.equal(player.seekCalls.at(-1)?.seconds, 70);
  assert.equal(h.states.at(-1), false);
  assert.equal(player.calls.filter(call => call.name === 'load').length, 1);
  h.controller.destroy();
});

test('the latest queued seek waits for finite metadata and preserves a pause during iframe setup', async () => {
  const h = harness();
  h.controller.load(first);
  h.controller.seekTo(35);
  h.controller.seekTo(200);
  h.controller.pause();
  h.readyApi();
  await setImmediate();
  const player = h.players[0];
  player.duration = 0;
  player.event('onReady');
  assert.equal(player.seekCalls.length, 0);
  assert.equal(h.controller.getProgress().duration, 0);
  player.duration = 120;
  assert.equal(h.controller.getProgress().currentTime, 120);
  assert.deepEqual(player.seekCalls, [{ seconds: 120, allowSeekAhead: true }]);
  assert.equal(player.calls.at(-1)?.name, 'pause');
  assert.equal(h.states.includes(true), false);
  h.controller.destroy();
});

test('replacing a selection cancels its queued seek and destroyed controls cannot seek or expose stale progress', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  player.duration = 0;
  h.controller.seekTo(100);
  h.controller.load(second);
  player.duration = 300;
  h.controller.getProgress();
  assert.equal(player.seekCalls.length, 0);
  h.controller.destroy();
  h.controller.seekTo(30);
  h.controller.setLoop(true);
  assert.deepEqual({ ...h.controller.getProgress() }, { currentTime: 0, duration: 0 });
  assert.equal(player.seekCalls.length, 0);
});

test('videos stop at the end by default, and loop toggles restart the whole video only when enabled and playing', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  player.event('onStateChange', 1);
  player.event('onStateChange', 0);
  assert.equal(player.seekCalls.length, 0);
  assert.equal(player.calls.some(call => call.name === 'play'), false);
  assert.equal(h.states.at(-1), false);
  h.controller.setLoop(true);
  h.controller.play();
  player.event('onStateChange', 1);
  player.event('onStateChange', 0);
  assert.deepEqual(player.seekCalls, [{ seconds: 0, allowSeekAhead: true }]);
  assert.equal(player.calls.at(-1)?.name, 'play');
  h.controller.setLoop(false);
  player.event('onStateChange', 1);
  player.event('onStateChange', 0);
  assert.equal(player.seekCalls.length, 1);
  h.controller.setLoop(true);
  h.controller.pause();
  player.event('onStateChange', 0);
  assert.equal(player.seekCalls.length, 1);
  h.controller.destroy();
});

test('caption requests queue before readiness and toggling does not replace or restart playback', async () => {
  const h = harness();
  assert.deepEqual(h.captions, [{ enabled: false, available: false }]);
  h.controller.setCaptions(true);
  const player = await readyPlayer(h);
  assert.deepEqual(player.captionCalls, ['load:captions']);
  assert.deepEqual(h.captions.at(-1), { enabled: false, available: false });
  player.modules = ['captions'];
  player.event('onApiChange');
  assert.deepEqual(h.captions.at(-1), { enabled: true, available: true });
  assert.equal(player.captionOptions.length, 0, 'explicitly enabled captions must keep their track');
  h.controller.setCaptions(false);
  assert.equal(JSON.stringify(player.captionOptions.at(-1)), JSON.stringify({ module: 'captions', option: 'track', value: {} }));
  assert.equal(player.captionCalls.at(-1), 'unload:captions');
  assert.deepEqual(h.captions.at(-1), { enabled: false, available: true });
  player.modules = [];
  player.event('onApiChange');
  assert.deepEqual(h.captions.at(-1), { enabled: false, available: true });
  h.controller.setCaptions(true);
  assert.equal(player.captionCalls.at(-1), 'load:captions');
  player.modules = ['captions'];
  player.event('onApiChange');
  assert.deepEqual(h.captions.at(-1), { enabled: true, available: true });
  assert.equal(player.calls.filter(call => call.name === 'load').length, 1);
  assert.equal(player.calls.some(call => call.name === 'play' || call.name === 'pause'), false);
  assert.equal(player.seekCalls.length, 0);
  h.controller.destroy();
});

test('default-off captions clear YouTube-selected tracks and stay off after changing videos', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  for (const video of [first, second]) {
    h.controller.load(video);
    player.modules = ['captions'];
    player.event('onApiChange');
    assert.equal(player.captionCalls.at(-1), 'unload:captions');
    assert.equal(JSON.stringify(player.captionOptions.at(-1)), JSON.stringify({ module: 'captions', option: 'track', value: {} }));
    assert.deepEqual(h.captions.at(-1), { enabled: false, available: true });
    player.modules = [];
    player.event('onApiChange');
  }
  assert.equal(player.captionOptions.length, 2);
  assert.equal(player.calls.some(call => call.name === 'pause'), false);
  h.controller.destroy();
});

test('default-off captions still unload when clearing the selected track is unsupported', async () => {
  for (const unsupported of ['missing', 'throwing']) {
    const h = harness();
    const player = await readyPlayer(h);
    player.setOption = unsupported === 'missing' ? undefined as unknown as typeof player.setOption
      : () => { throw new Error('Unsupported option'); };
    player.modules = ['captions'];
    player.event('onApiChange');
    assert.equal(player.captionCalls.at(-1), 'unload:captions');
    assert.deepEqual(h.captions.at(-1), { enabled: false, available: true });
    assert.deepEqual(h.errorCodes, []);
    h.controller.destroy();
  }
});

test('caption discovery waits for tracks where exposed, and remembers availability when subtitles are off', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  player.modules = ['captions'];
  player.tracks = [];
  player.event('onApiChange');
  assert.deepEqual(h.captions.at(-1), { enabled: false, available: false });
  assert.equal(player.captionCalls.includes('unload:captions'), false);
  player.tracks = [{ languageCode: 'en' }];
  player.event('onApiChange');
  assert.equal(player.captionCalls.at(-1), 'unload:captions');
  assert.deepEqual(h.captions.at(-1), { enabled: false, available: true });
  player.modules = [];
  player.event('onApiChange');
  assert.deepEqual(h.captions.at(-1), { enabled: false, available: true });
  h.controller.destroy();
});

test('caption preference persists across selections while availability is discovered for each new video', async () => {
  const h = harness();
  h.controller.setCaptions(true);
  const player = await readyPlayer(h);
  player.modules = ['captions'];
  player.event('onApiChange');
  assert.equal(h.captions.at(-1)?.enabled, true);
  player.modules = [];
  h.controller.load(second);
  assert.deepEqual(h.captions.at(-1), { enabled: false, available: false });
  player.modules = ['captions'];
  player.event('onApiChange');
  assert.deepEqual(h.captions.at(-1), { enabled: true, available: true });
  h.controller.destroy();
  const count = h.captions.length;
  h.controller.setCaptions(false);
  player.event('onApiChange');
  assert.equal(h.captions.length, count);
});

test('unsupported or throwing caption APIs stay unavailable without breaking video playback', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  player.loadModule = undefined as unknown as typeof player.loadModule;
  h.controller.setCaptions(true);
  player.event('onApiChange');
  assert.deepEqual(h.captions.at(-1), { enabled: false, available: false });
  player.loadModule = () => { throw new Error('Unsupported module'); };
  h.controller.setCaptions(true);
  assert.deepEqual(h.captions.at(-1), { enabled: false, available: false });
  assert.deepEqual(h.errorCodes, []);
  assert.equal(player.calls.some(call => call.name === 'pause'), false);
  h.controller.destroy();
});


test('a transitional pause from the old video cannot cancel playback of a replacement selection', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  player.event('onStateChange', 1);
  h.controller.load({ ...first, startSeconds: 120 });
  player.event('onStateChange', 2);
  player.event('onStateChange', 5);
  player.event('onStateChange', 2);
  player.event('onStateChange', 1);
  assert.equal(h.states.at(-1), true);
  assert.equal(player.calls.some(call => call.name === 'pause'), false);
  assert.deepEqual(player.calls.at(-1), { name: 'load', request: { videoId: VIDEO, startSeconds: 120 } });
  // A pause after the replacement has actually played remains authoritative.
  player.event('onStateChange', 2);
  player.event('onStateChange', 1);
  assert.equal(h.states.at(-1), false);
  assert.equal(player.calls.at(-1)?.name, 'pause');
  h.controller.destroy();
});

test('explicit Pause after replacement still rejects late autoplay from the new selection', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  player.event('onStateChange', 1);
  h.controller.load(second);
  h.controller.pause();
  const count = h.states.length;
  player.event('onStateChange', 2);
  player.event('onStateChange', 5);
  player.event('onStateChange', 1);
  assert.equal(h.states.at(-1), false);
  assert.equal(h.states.slice(count).includes(true), false);
  assert.equal(player.calls.at(-1)?.name, 'pause');
  h.controller.destroy();
});

test('sound starts enabled at full volume, and audible autoplay blocking never triggers a muted fallback', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  assert.deepEqual(player.calls.slice(0, 3), [
    { name: 'volume', volume: 100 },
    { name: 'unmute' },
    { name: 'load', request: { videoId: VIDEO, startSeconds: 42 } },
  ]);
  player.event('onAutoplayBlocked');
  assert.equal(h.errors.at(-1), 'blocked');
  assert.equal(h.states.at(-1), false);
  assert.equal(player.calls.some(call => call.name === 'mute'), false);
  h.controller.play();
  assert.equal(player.calls.at(-1)?.name, 'play');
  assert.equal(player.calls.some(call => call.name === 'mute'), false);
  h.controller.destroy();
});

test('volume queues before readiness and the latest level applies before cueing without altering mute', async () => {
  const h = harness();
  h.controller.setVolume(25);
  h.controller.setVolume(63);
  h.controller.setMuted(true);
  assert.equal(h.head.children.length, 0);
  h.controller.load(first);
  h.controller.pause();
  h.readyApi();
  await setImmediate();
  const player = h.players[0];
  player.event('onReady');
  assert.deepEqual(player.calls, [
    { name: 'volume', volume: 63 },
    { name: 'mute' },
    { name: 'cue', request: { videoId: VIDEO, startSeconds: 42 } },
  ]);
  h.controller.destroy();
});

test('volume clamps finite levels to whole percentages while leaving mute independent', async () => {
  const h = harness();
  const player = await readyPlayer(h);
  h.controller.setVolume(-1);
  assert.deepEqual(player.calls.at(-1), { name: 'volume', volume: 0 });
  assert.equal(player.calls.some(call => call.name === 'mute'), false);
  h.controller.setVolume(101);
  assert.deepEqual(player.calls.at(-1), { name: 'volume', volume: 100 });
  h.controller.setVolume(49.7);
  assert.deepEqual(player.calls.at(-1), { name: 'volume', volume: 50 });
  const count = player.calls.length;
  for (const invalid of [NaN, Infinity, -Infinity]) h.controller.setVolume(invalid);
  assert.equal(player.calls.length, count);
  h.controller.setMuted(true);
  h.controller.setVolume(80);
  assert.deepEqual(player.calls.slice(-2), [{ name: 'mute' }, { name: 'volume', volume: 80 }]);
  h.controller.setMuted(false);
  assert.equal(player.calls.at(-1)?.name, 'unmute');
  h.controller.destroy();
  const destroyedCount = player.calls.length;
  h.controller.setVolume(10);
  assert.equal(player.calls.length, destroyedCount);
});

test('chosen volume and mute survive an iframe failure, retry, and subsequent video replacement', async () => {
  const h = harness({ apiAvailable: true });
  h.controller.setVolume(37);
  h.controller.setMuted(true);
  h.controller.load(first);
  await setImmediate();
  h.players[0].event('onError', 153);
  h.controller.load(second);
  await setImmediate();
  const player = h.players[1];
  player.event('onReady');
  assert.deepEqual(player.calls.slice(0, 3), [
    { name: 'volume', volume: 37 },
    { name: 'mute' },
    { name: 'load', request: { videoId: SECOND, startSeconds: 0 } },
  ]);
  h.controller.setVolume(65);
  h.controller.setMuted(false);
  h.controller.load(first);
  assert.deepEqual(player.calls.slice(-3), [
    { name: 'volume', volume: 65 },
    { name: 'unmute' },
    { name: 'load', request: { videoId: VIDEO, startSeconds: 42 } },
  ]);
  h.controller.destroy();
});
