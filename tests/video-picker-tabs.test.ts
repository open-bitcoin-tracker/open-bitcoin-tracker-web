import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import { parseYouTubeVideo } from '../src/lib/youtube-player.ts';
import { video } from '../src/i18n/video.ts';
import { party } from '../src/i18n/party.ts';
import type { createVideoPickerTabs } from '../src/lib/video-picker-tabs.ts';
import { videoSections, videoSuggestions } from '../src/lib/video-suggestions.ts';

const script = ts.transpileModule(readFileSync(new URL('../src/lib/video-picker-tabs.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const first = 'https://www.youtube.com/watch?v=abcdefghijk';
const second = 'https://www.youtube.com/watch?v=ZYXWVUTSRQP&t=30s';
const storageKey = 'obt-video-recents';

class Element extends EventTarget {
  children: Element[] = [];
  controls = new Map<string, Element>();
  attributes = new Map<string, string>();
  dataset: Record<string, string> = {};
  hidden = false;
  disabled = true;
  tabIndex = 0;
  focusCount = 0;
  textContent = '';
  className = '';
  type = '';
  title = '';
  src = '';
  alt = '';
  querySelector(selector: string) {
    if (!this.controls.has(selector)) this.controls.set(selector, new Element());
    return this.controls.get(selector)!;
  }
  querySelectorAll(selector: string) {
    assert.equal(selector, '[data-video-suggestion]');
    return videoSuggestions.map(suggestion => {
      const button = this.querySelector(`[data-video-suggestion="${suggestion.id}"]`);
      button.dataset.videoSuggestion = suggestion.id;
      button.title = suggestion.title;
      return button;
    });
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  focus() { this.focusCount++; }
  click() { this.dispatchEvent(new Event('click')); }
}

function harness({ saved, blocked = false, deferMetadata = false }: { saved?: string; blocked?: boolean; deferMetadata?: boolean } = {}) {
  const root = new Element();
  const storage = new Map<string, string>();
  if (saved !== undefined) storage.set(storageKey, saved);
  const writes: string[] = [];
  const selected: { id: string; startSeconds: number }[] = [];
  const requests: { url: string; signal: AbortSignal; resolve(value: { ok: boolean; json(): Promise<unknown> }): void }[] = [];
  const exports: { createVideoPickerTabs?: typeof createVideoPickerTabs } = {};
  runInNewContext(script, {
    exports, require: () => ({ parseYouTubeVideo, videoSections, videoSuggestions }), AbortController, AbortSignal, URLSearchParams,
    fetch: (url: string, options: { signal: AbortSignal }) => new Promise(resolve => {
      requests.push({ url, signal: options.signal, resolve });
      if (!deferMetadata) resolve({ ok: false });
    }),
    document: { createElement: () => new Element(), createElementNS: () => new Element() },
    window: { localStorage: {
      getItem(key: string) { if (blocked) throw Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key: string, value: string) { if (blocked) throw Error('Storage blocked'); storage.set(key, value); writes.push(value); },
    } },
  });
  const controller = exports.createVideoPickerTabs!(root as unknown as HTMLElement, {
    copy: { ...video.en, live: party.en.live }, onSelect: value => selected.push({ ...value }),
  });
  const recent = root.querySelector('[data-video-tab="recent"]');
  const partyTab = root.querySelector('[data-video-tab="party"]');
  const list = root.querySelector('[data-video-recents]');
  return {
    controller, root, recent, partyTab, list, writes, selected, storage, requests,
    urls: () => list.children.map(row => row.children[0].dataset.recentVideo),
    async title(index: number, value: unknown, ok = true) {
      requests[index].resolve({ ok, json: async () => ({ title: value }) });
      await setImmediate();
    },
    play(index: number) { list.children[index].children[0].click(); },
    remove(index: number) { list.children[index].children[1].click(); },
    key(tab: Element, key: string) {
      const event = Object.assign(new Event('keydown', { cancelable: true }), { key });
      tab.dispatchEvent(event);
      return event.defaultPrevented;
    },
  };
}

test('all sections support click and keyboard navigation, skipping empty Recent without changing playback', () => {
  const h = harness();
  const chill = h.root.querySelector('[data-video-tab="chill"]');
  const silent = h.root.querySelector('[data-video-tab="without-sound"]');
  const tabs = [h.recent, h.partyTab, chill, silent];
  function selected(tab: Element, panel: string) {
    for (const candidate of tabs) {
      assert.equal(candidate.attributes.get('aria-selected'), String(candidate === tab));
      assert.equal(candidate.tabIndex, candidate === tab ? 0 : -1);
    }
    for (const id of ['recent', 'party', 'chill', 'without-sound']) {
      assert.equal(h.root.querySelector(`[data-video-panel="${id}"]`).hidden, id !== panel);
    }
  }
  selected(h.partyTab, 'party');
  assert.ok(tabs.every(tab => !tab.disabled));
  assert.equal(h.recent.hidden, true);
  chill.click();
  selected(chill, 'chill');
  silent.click();
  selected(silent, 'without-sound');
  assert.equal(h.key(silent, 'ArrowRight'), true);
  selected(h.partyTab, 'party');
  assert.equal(h.key(h.partyTab, 'ArrowLeft'), true);
  selected(silent, 'without-sound');
  assert.equal(h.key(silent, 'Home'), true);
  selected(h.partyTab, 'party');
  assert.equal(h.key(h.partyTab, 'End'), true);
  selected(silent, 'without-sound');
  h.controller.remember(first);
  assert.equal(h.recent.hidden, false);
  selected(h.recent, 'recent');
  assert.equal(h.key(h.recent, 'ArrowRight'), true);
  selected(h.partyTab, 'party');
  assert.equal(h.key(h.partyTab, 'ArrowRight'), true);
  selected(chill, 'chill');
  assert.equal(h.key(chill, 'ArrowRight'), true);
  selected(silent, 'without-sound');
  assert.equal(h.key(silent, 'ArrowRight'), true);
  selected(h.recent, 'recent');
  assert.equal(h.key(h.recent, 'ArrowLeft'), true);
  selected(silent, 'without-sound');
  assert.equal(h.key(silent, 'Home'), true);
  selected(h.recent, 'recent');
  assert.equal(h.key(h.recent, 'End'), true);
  selected(silent, 'without-sound');
  assert.equal(h.key(silent, 'Escape'), false, 'Escape belongs to the drawer');
  assert.deepEqual(h.selected, []);
  assert.equal(h.writes.length, 1, 'tab changes must not add storage writes');
  h.controller.destroy();
  h.partyTab.click();
  assert.equal(h.key(silent, 'Home'), false, 'destroy removes handlers from every category');
  selected(silent, 'without-sound');
});

test('submitted URLs are validated, canonicalized, deduplicated, ordered by use, and restored across visits', () => {
  const h = harness();
  h.controller.remember('https://youtu.be/abcdefghijk?si=private-share');
  h.controller.remember('https://youtu.be/ZYXWVUTSRQP?t=30&list=ignored');
  assert.deepEqual(h.urls(), [second, first]);
  h.controller.remember(`${first}&si=another-token`);
  assert.deepEqual(h.urls(), [first, second]);
  h.controller.remember('https://youtube.com.evil.example/watch?v=abcdefghijk');
  assert.deepEqual(h.urls(), [first, second]);
  assert.equal(h.writes.length, 3);
  assert.equal(h.recent.attributes.get('aria-selected'), 'true');
  assert.equal(h.recent.hidden, false);
  const saved = h.storage.get(storageKey)!;
  assert.deepEqual(JSON.parse(saved), { version: 1, urls: [first, second] });
  h.controller.destroy();
  const restored = harness({ saved });
  assert.deepEqual(restored.urls(), [first, second]);
  assert.equal(restored.recent.attributes.get('aria-selected'), 'true');
  assert.deepEqual(restored.writes, []);
  restored.controller.destroy();
});

test('recent selections use validated playback and each delete only removes its own URL, preserving keyboard focus', () => {
  const h = harness({ saved: JSON.stringify({ version: 1, urls: [first, second] }) });
  h.play(1);
  assert.deepEqual(h.selected, [{ id: 'ZYXWVUTSRQP', startSeconds: 30 }]);
  assert.deepEqual(h.urls(), [first, second], 'selecting a URL must not rearrange the visible list during the drawer exit');
  h.controller.remember(second);
  assert.deepEqual(h.urls(), [second, first]);
  h.remove(0);
  assert.deepEqual(h.urls(), [first]);
  assert.equal(h.list.children[0].children[1].focusCount, 1);
  assert.equal(h.selected.length, 1, 'deleting a playing URL must not alter playback');
  h.remove(0);
  assert.deepEqual(h.urls(), []);
  assert.equal(h.partyTab.focusCount, 1);
  assert.equal(h.recent.hidden, true);
  assert.equal(h.partyTab.attributes.get('aria-selected'), 'true');
  assert.equal(h.root.querySelector('[data-video-panel="recent"]').hidden, true);
  const saved = h.storage.get(storageKey)!;
  assert.deepEqual(JSON.parse(saved), { version: 1, urls: [] });
  h.controller.destroy();
  const restored = harness({ saved });
  assert.deepEqual(restored.urls(), [], 'deleted entries must not return after a reload');
  assert.equal(restored.recent.hidden, true);
  restored.controller.destroy();
});

test('deferred rendering still saves immediately and refreshes Recent before the picker reopens', () => {
  const h = harness();
  h.controller.remember(first, { deferRender: true });
  assert.deepEqual(JSON.parse(h.storage.get(storageKey)!), { version: 1, urls: [first] });
  assert.equal(h.recent.hidden, true, 'the outgoing panel must not change its visible tabs');
  assert.equal(h.partyTab.attributes.get('aria-selected'), 'true');
  h.controller.refresh();
  assert.deepEqual(h.urls(), [first]);
  assert.equal(h.recent.hidden, false);
  assert.equal(h.recent.attributes.get('aria-selected'), 'true');
  h.partyTab.click();
  h.controller.refresh();
  assert.equal(h.partyTab.attributes.get('aria-selected'), 'true', 'reopening without new history preserves the chosen tab');
  assert.equal(h.writes.length, 1, 'rendering must not rewrite or lose the saved URL');
  h.controller.destroy();
});

test('invalid saved history and blocked storage cannot interrupt the tabs or playback', () => {
  for (const saved of ['broken JSON', 'null', '{}', JSON.stringify({ version: 2, urls: [first] }), JSON.stringify({ version: 1, urls: 'not an array' })]) {
    const h = harness({ saved });
    assert.deepEqual(h.urls(), []);
    h.controller.destroy();
  }
  const mixed = harness({ saved: JSON.stringify({ version: 1, urls: [null, 2, {}, 'javascript:alert(1)', first, `${first}&si=ignored`, second] }) });
  assert.deepEqual(mixed.urls(), [first, second]);
  mixed.controller.destroy();
  const blocked = harness({ saved: JSON.stringify({ version: 1, urls: [second] }), blocked: true });
  blocked.controller.remember(first);
  assert.deepEqual(blocked.urls(), [first]);
  blocked.play(0);
  assert.deepEqual(blocked.selected, [{ id: 'abcdefghijk', startSeconds: 0 }]);
  blocked.remove(0);
  assert.deepEqual(blocked.urls(), []);
  blocked.controller.destroy();
});

test('destroyed picker tabs ignore stale history buttons and do not change storage', () => {
  const h = harness({ saved: JSON.stringify({ version: 1, urls: [first] }) });
  const [load, remove] = h.list.children[0].children;
  h.controller.destroy();
  h.controller.destroy();
  load.click();
  remove.click();
  h.recent.click();
  h.controller.remember(second);
  assert.deepEqual(h.selected, []);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.urls(), [first]);
});

test('Recent shows thumbnails and fetched titles, caches metadata, and restores older URL-only history', async () => {
  const h = harness({ saved: JSON.stringify({ version: 1, urls: [first] }), deferMetadata: true });
  const card = h.list.children[0].children[0];
  assert.equal(card.children[0].src, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
  assert.equal(card.children[0].alt, '');
  assert.equal(card.children[1].textContent, video.en.recentTitleLoading);
  assert.equal(h.requests.length, 0, 'metadata waits until the picker opens');
  h.controller.refresh();
  assert.equal(h.requests.length, 1);
  const request = new URL(h.requests[0].url);
  assert.equal(request.origin, 'https://www.youtube.com');
  assert.equal(request.pathname, '/oembed');
  assert.equal(request.searchParams.get('url'), first);
  await h.title(0, 'A video <title> & music');
  assert.equal(card.children[1].textContent, 'A video <title> & music', 'metadata is inserted as text');
  assert.equal(card.attributes.get('aria-label'), `${video.en.load}: A video <title> & music`);
  const saved = h.storage.get(storageKey)!;
  assert.deepEqual(JSON.parse(saved), { version: 1, urls: [first], titles: { abcdefghijk: 'A video <title> & music' } });
  h.controller.destroy();

  const restored = harness({ saved });
  restored.controller.refresh();
  assert.equal(restored.list.children[0].children[0].children[1].textContent, 'A video <title> & music');
  assert.equal(restored.requests.length, 0, 'cached titles should not be fetched again');
  restored.remove(0);
  assert.deepEqual(JSON.parse(restored.storage.get(storageKey)!), { version: 1, urls: [] });
  restored.controller.destroy();
});

test('suggested video titles need no fetch, while unavailable titles retain playback and deletion', async () => {
  const suggestion = videoSuggestions[0];
  const known = harness({ saved: JSON.stringify({ version: 1, urls: [`https://www.youtube.com/watch?v=${suggestion.id}`] }) });
  known.controller.refresh();
  assert.equal(known.list.children[0].children[0].children[1].textContent, suggestion.title);
  assert.equal(known.requests.length, 0);
  known.controller.destroy();

  const unavailable = harness({ saved: JSON.stringify({ version: 1, urls: [first] }), deferMetadata: true });
  unavailable.controller.refresh();
  await unavailable.title(0, '', false);
  assert.equal(unavailable.list.children[0].children[0].children[1].textContent, video.en.recentTitleUnavailable);
  unavailable.play(0);
  assert.deepEqual(unavailable.selected, [{ id: 'abcdefghijk', startSeconds: 0 }]);
  unavailable.remove(0);
  assert.deepEqual(unavailable.urls(), []);
  unavailable.controller.destroy();
});

test('late metadata cannot restore deleted entries or update a destroyed picker', async () => {
  const h = harness({ saved: JSON.stringify({ version: 1, urls: [first] }), deferMetadata: true });
  h.controller.refresh();
  h.remove(0);
  await h.title(0, 'Removed video title');
  assert.deepEqual(JSON.parse(h.storage.get(storageKey)!), { version: 1, urls: [] });
  assert.equal(h.recent.hidden, true);
  h.controller.destroy();

  const destroyed = harness({ saved: JSON.stringify({ version: 1, urls: [first] }), deferMetadata: true });
  destroyed.controller.refresh();
  const title = destroyed.list.children[0].children[0].children[1];
  destroyed.controller.destroy();
  assert.equal(destroyed.requests[0].signal.aborted, true);
  await destroyed.title(0, 'Late title');
  assert.equal(title.textContent, video.en.recentTitleLoading);
  assert.deepEqual(destroyed.writes, []);
});

test('live suggestions show badges in both tabs without inferring status from titles', () => {
  const live = videoSuggestions.find(video => video.isLive)!;
  const recorded = videoSuggestions.find(video => video.id === '784dsKVrdjQ')!;
  const h = harness({ saved: JSON.stringify({ version: 1, urls: [
    `https://www.youtube.com/watch?v=${live.id}`, `https://www.youtube.com/watch?v=${recorded.id}`,
  ] }) });
  for (const [suggestion, hidden] of [[live, false], [recorded, true]] as const) {
    const button = h.root.querySelector(`[data-video-suggestion="${suggestion.id}"]`);
    assert.equal(button.querySelector('[data-video-live]').hidden, hidden);
    assert.equal(button.attributes.get('aria-label'), `${video.en.load}: ${suggestion.title}${hidden ? '' : ` (${party.en.live})`}`);
  }
  const [liveCard, recordedCard] = h.list.children.map(row => row.children[0]);
  assert.equal(liveCard.children[2].hidden, false);
  assert.equal(liveCard.children[2].textContent, party.en.live);
  assert.equal(recordedCard.children[2].hidden, true, 'Live Wallpaper is a recording, not a broadcast');
  h.controller.setLiveStatus(live.id, false);
  assert.equal(liveCard.children[2].hidden, true);
  assert.equal(h.root.querySelector(`[data-video-suggestion="${live.id}"]`).querySelector('[data-video-live]').hidden, true);
  const restored = harness({ saved: h.storage.get(storageKey) });
  assert.equal(restored.list.children[0].children[0].children[2].hidden, true, 'confirmed playback metadata overrides the catalog across reloads');
  h.controller.destroy();
  restored.controller.destroy();
});

test('playback live status updates matching Recent entries, persists, and ignores duplicates and removed entries', () => {
  const h = harness();
  h.controller.remember(first);
  h.controller.remember(`${first}&t=30s`);
  assert.equal(h.list.children[0].children[0].children[2].hidden, true, 'unknown metadata must not claim a video is live');
  h.controller.setLiveStatus('abcdefghijk', true);
  for (const row of h.list.children) {
    assert.equal(row.children[0].children[2].hidden, false);
    assert.ok(row.children[0].attributes.get('aria-label')!.endsWith(` (${party.en.live})`));
  }
  assert.equal(h.writes.length, 3);
  h.controller.setLiveStatus('abcdefghijk', true);
  assert.equal(h.writes.length, 3, 'repeated progress polls must not rewrite storage');
  const restored = harness({ saved: h.storage.get(storageKey) });
  assert.equal(restored.list.children[0].children[0].children[2].hidden, false);
  h.controller.setLiveStatus('abcdefghijk', false);
  assert.equal(h.list.children[0].children[0].children[2].hidden, true);
  h.remove(0);
  h.remove(0);
  const writes = h.writes.length;
  h.controller.setLiveStatus('abcdefghijk', true);
  assert.equal(h.writes.length, writes, 'late metadata must not restore a deleted URL');
  assert.deepEqual(JSON.parse(h.storage.get(storageKey)!), { version: 1, urls: [] });
  h.controller.destroy();
  h.controller.setLiveStatus('abcdefghijk', false);
  assert.equal(h.writes.length, writes);
  restored.controller.destroy();
});

test('malformed saved live status cannot mark a Recent video live', () => {
  for (const value of ['true', 1, {}, null]) {
    const h = harness({ saved: JSON.stringify({ version: 1, urls: [first], live: { abcdefghijk: value } }) });
    assert.equal(h.list.children[0].children[0].children[2].hidden, true);
    h.controller.destroy();
  }
});
