import { browserModule } from './support/browser-module.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { onRequest } from '../functions/_middleware.js';

const pages = ['', 'price-tracker', 'party-mode', 'video-mode', 'android-app', 'a-bit-of-earth', 'bitcoin-and-the-dollar', 'about', 'android-app/about', 'privacy'];
const locales = ['es', 'pt', 'ru', 'tr', 'vi', 'ja', 'fr', 'de', 'it'];
function request(path: string, language = 'es-ES,es;q=0.9,en;q=0.8', cookie = '', method = 'GET') {
  let passed = false;
  const response = onRequest({
    request: new Request(`https://example.com${path}`, { method, headers: { 'Accept-Language': language, Cookie: cookie } }),
    next: async () => {
      passed = true;
      return new Response('page', { headers: { Vary: 'Accept-Encoding' } });
    },
  });
  return { response, passed: () => passed };
}

test('language detection covers every English page and locale, preserving query strings', async () => {
  for (const page of pages) {
    for (const locale of locales) {
      const { response, passed } = request(`/${page}${page ? '/' : ''}?view=full`, `${locale}-XX`);
      const res = await response;
      assert.equal(passed(), false);
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('Location'), `https://example.com/${locale}/${page ? `${page}/` : ''}?view=full`);
      assert.match(res.headers.get('Set-Cookie')!, new RegExp(`^lang=${locale};`));
      assert.match(res.headers.get('Set-Cookie')!, /Max-Age=15552000; SameSite=Lax; Secure/);
      assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
      assert.match(res.headers.get('Vary')!, /Accept-Language, Cookie/);
    }
  }
  for (const path of ['/about', '/about/', '/about/index.html', '/index.html']) {
    const res = await request(path, 'pt-BR').response;
    assert.equal(res.headers.get('Location'), `https://example.com/pt/${path.includes('about') ? 'about/' : ''}`);
  }
});

test('language matching respects browser priorities, regional tags, exclusions, and English fallback', async () => {
  for (const [header, locale] of [
    ['fr;q=0.5,de-DE;q=0.9', 'de'], ['en-GB,es;q=0.9', 'en'],
    ['zh-CN,ja-JP;q=0.8', 'ja'], ['pt-PT', 'pt'], ['xx', 'en'],
    ['', 'en'], ['de;q=0,en;q=1', 'en'], ['de;q=2,fr;q=0.5', 'fr'],
    ['de;q=.,fr;q=0.5', 'fr'], ['*', 'en'],
  ]) {
    const res = await request('/price-tracker/', header).response;
    assert.equal(res.status, locale === 'en' ? 200 : 302, header);
    assert.match(res.headers.get('Set-Cookie')!, new RegExp(`^lang=${locale};`));
    if (locale === 'en') assert.equal(res.headers.get('Vary'), 'Accept-Encoding, Accept-Language, Cookie');
  }
});

test('saved language overrides browser detection, including English and invalid cookie recovery', async () => {
  for (const locale of ['en', ...locales]) {
    const res = await request('/privacy/?from=footer', 'fr', `other=1; lang=${locale}`).response;
    assert.equal(res.headers.get('Location'), locale === 'en' ? null : `https://example.com/${locale}/privacy/?from=footer`);
    assert.equal(res.headers.get('Set-Cookie'), null);
    assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  }
  const res = await request('/', 'de', 'lang=invalid').response;
  assert.equal(res.headers.get('Location'), 'https://example.com/de/');
});

test('localized URLs, assets, missing pages, and non-navigation methods pass through without cookies or redirects', async () => {
  for (const path of [...locales.flatMap(locale => pages.map(page => `/${locale}/${page}`)),
    '/data/btc-history.csv', '/favicon.ico', '/robots.txt', '/sitemap-index.xml', '/missing/', '/es/missing/',
  ]) {
    const { response, passed } = request(path, 'de', 'lang=fr');
    const res = await response;
    assert.equal(passed(), true, path);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Set-Cookie'), null);
    assert.equal(res.headers.get('Location'), null);
  }
  assert.equal((await request('/about/', 'de', '', 'HEAD').response).status, 302);
  const post = request('/about/', 'de', '', 'POST');
  assert.equal((await post.response).status, 200);
  assert.equal(post.passed(), true);
});

function componentScript(name: string) {
  const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
  return source.match(/<script(?: is:inline)?>([\s\S]*?)<\/script>/)![1];
}
const themeInit = componentScript('layouts/Layout.astro');
const themeToggle = ts.transpileModule(componentScript('components/ThemeToggle.astro'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
class DetailEvent extends Event {
  detail: any;
  constructor(type: string, options: { detail?: any } = {}) { super(type); this.detail = options.detail; }
}
function themePage(dark = false, saved: string | null = null, blocked = false) {
  const classes = new Set<string>();
  const metas: any[] = [];
  const toggles = ['auto', 'light', 'dark'].map(preference => Object.assign(new EventTarget(), {
    dataset: { themePreference: preference },
    textContent: { auto: 'Auto', light: 'Light mode', dark: 'Dark mode' }[preference],
    closest: () => themeSelector,
    attributes: new Map<string, string>(),
    setAttribute(name: string, value: string) { this.attributes.set(name, value); },
  }));
  const label = { textContent: '' };
  const summary = { hasAttribute: () => false, focused: false, focus() { this.focused = true; } };
  const themeSelector = Object.assign(new EventTarget(), {
    open: false,
    hasAttribute: () => false,
    contains: (target: EventTarget) => target === themeSelector || toggles.includes(target as typeof toggles[number]),
    querySelector: (query: string): object | undefined => query === 'summary' ? summary : query === '[data-theme-current]' ? label : toggles.find(toggle => toggle.attributes.get('aria-pressed') === 'true'),
  });
  const root = { dataset: { themePreference: '' }, classList: {
    contains: (name: string) => classes.has(name), add: (name: string) => classes.add(name),
    remove: (name: string) => classes.delete(name),
    toggle(name: string, force = !classes.has(name)) { if (force) classes.add(name); else classes.delete(name); return force; },
  } };
  const document = Object.assign(new EventTarget(), {
    documentElement: root,
    querySelectorAll: (selector: string) => selector === '.theme-toggle' ? toggles : selector === '.theme-selector' ? [themeSelector] : [...metas],
    createElement: () => {
      const meta = { name: '', content: '', remove() { metas.splice(metas.indexOf(meta), 1); } };
      return meta;
    },
    head: { appendChild: (meta: any) => metas.push(meta) },
  });
  const system = Object.assign(new EventTarget(), { matches: dark });
  const window = Object.assign(new EventTarget(), {
    matchMedia: (query: string) => query.includes('color-scheme') ? system : { matches: true },
  });
  const localStorage = {
    getItem: () => { if (blocked) throw Error('blocked'); return saved; },
    setItem: (_key: string, value: string) => { if (blocked) throw Error('blocked'); saved = value; },
  };
  const globals = { document, window, localStorage, CustomEvent: DetailEvent };
  runInNewContext(themeInit, globals);
  const initialDark = classes.has('dark');
  runInNewContext(themeToggle, globals);
  browserModule('lib/disclosure-menu', globals).createDisclosureMenu(themeSelector);
  return {
    classes, metas, toggles, selector: themeSelector, label, summary, initialDark, saved: () => saved,
    selected: () => toggles.filter(toggle => toggle.attributes.get('aria-pressed') === 'true').map(toggle => toggle.dataset.themePreference),
    outsideClick() { document.dispatchEvent(new Event('click')); },
    system(value: boolean) { system.matches = value; system.dispatchEvent(new Event('change')); },
    storage(key: string | null, newValue: string | null) { window.dispatchEvent(Object.assign(new Event('storage'), { key, newValue })); },
  };
}

test('theme initializes before controls from system or valid saved preference, even with blocked storage', () => {
  for (const [system, saved, expected, blocked] of [
    [true, null, true, false], [false, null, false, false],
    [true, 'light', false, false], [false, 'dark', true, false],
    [true, 'invalid', true, false], [true, 'light', true, true],
    [true, 'auto', true, false], [false, 'auto', false, false],
  ] as const) {
    const page = themePage(system, saved, blocked);
    assert.equal(page.initialDark, expected);
    assert.equal(page.metas.length, 1);
    assert.equal(page.metas[0].content, expected ? '#0F1E3A' : '#F8F7F3');
    assert.deepEqual(page.selected(), [!blocked && (saved === 'light' || saved === 'dark') ? saved : 'auto']);
  }
});

test('system theme changes update browser chrome and controls until a manual choice, including with blocked storage', () => {
  for (const blocked of [false, true]) {
    const page = themePage(false, null, blocked);
    page.system(true);
    assert.equal(page.classes.has('dark'), true);
    assert.equal(page.metas[0].content, '#0F1E3A');
    assert.deepEqual(page.selected(), ['auto']);
    page.toggles[1].dispatchEvent(new Event('click'));
    assert.equal(page.classes.has('dark'), false);
    assert.equal(page.metas[0].content, '#F8F7F3');
    assert.deepEqual(page.selected(), ['light']);
    assert.equal(page.saved(), blocked ? null : 'light');
    page.system(false);
    page.system(true);
    assert.equal(page.classes.has('dark'), false, 'manual choice overrides later system changes');
  }
});

test('Auto restores live system detection after either manual choice, including with blocked storage', () => {
  for (const blocked of [false, true]) {
    for (const manual of ['light', 'dark']) {
      for (const systemDark of [false, true]) {
        const page = themePage(systemDark, null, blocked);
        page.toggles[manual === 'light' ? 1 : 2].dispatchEvent(new Event('click'));
        assert.deepEqual(page.selected(), [manual]);
        assert.equal(page.classes.has('dark'), manual === 'dark');
        page.toggles[0].dispatchEvent(new Event('click'));
        assert.deepEqual(page.selected(), ['auto']);
        assert.equal(page.classes.has('dark'), systemDark);
        assert.equal(page.saved(), blocked ? null : 'auto');
        page.system(!systemDark);
        assert.equal(page.classes.has('dark'), !systemDark);
        assert.equal(page.metas[0].content, systemDark ? '#F8F7F3' : '#0F1E3A');
        assert.equal(page.metas.length, 1);
        assert.deepEqual(page.selected(), ['auto']);
        const reloaded = themePage(!systemDark, page.saved(), blocked);
        assert.equal(reloaded.initialDark, !systemDark);
        assert.deepEqual(reloaded.selected(), ['auto']);
      }
    }
  }
});

test('theme dropdown updates its label, closes after selection, and restores trigger focus', () => {
  const page = themePage(false, null);
  assert.equal(page.label.textContent, 'Auto');
  page.selector.open = true;
  page.toggles[2].dispatchEvent(new Event('click'));
  assert.equal(page.label.textContent, 'Dark mode');
  assert.equal(page.selector.open, false);
  assert.equal(page.summary.focused, true);
  page.selector.open = true;
  page.summary.focused = false;
  page.toggles[2].dispatchEvent(new Event('click'));
  assert.equal(page.selector.open, false, 'selecting the current option also dismisses the dropdown');
  assert.equal(page.summary.focused, true);
  page.storage('theme', 'auto');
  assert.equal(page.label.textContent, 'Auto');
  page.system(true);
  assert.equal(page.label.textContent, 'Auto', 'the label names the preference rather than the resolved appearance');
});

test('theme dropdown dismisses on Escape or outside click', () => {
  const page = themePage();
  page.selector.open = true;
  page.selector.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
  assert.equal(page.selector.open, false);
  assert.equal(page.summary.focused, true);
  page.selector.open = true;
  page.outsideClick();
  assert.equal(page.selector.open, false);
});

test('saved theme survives system changes and other-tab changes can restore Auto', () => {
  const page = themePage(false, 'dark');
  page.system(true);
  page.system(false);
  assert.equal(page.classes.has('dark'), true);
  assert.deepEqual(page.selected(), ['dark']);
  page.storage('theme', 'light');
  assert.equal(page.classes.has('dark'), false);
  assert.deepEqual(page.selected(), ['light']);
  page.storage('other', 'dark');
  assert.equal(page.classes.has('dark'), false);
  page.storage('theme', 'auto');
  assert.deepEqual(page.selected(), ['auto']);
  page.system(true);
  assert.equal(page.classes.has('dark'), true);
  page.storage('theme', 'dark');
  page.storage('theme', null);
  assert.deepEqual(page.selected(), ['auto']);
  page.system(false);
  assert.equal(page.classes.has('dark'), false);
  page.storage('theme', 'dark');
  page.storage(null, null);
  assert.deepEqual(page.selected(), ['auto']);
  assert.equal(page.classes.has('dark'), false);
});

test('manual language selection saves a cookie that wins over detection on the next page', async () => {
  const script = ts.transpileModule(componentScript('components/LanguageSwitcher.astro'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  for (const protocol of ['https:', 'http:']) {
    for (const locale of ['en', ...locales]) {
      const link = Object.assign(new EventTarget(), { dataset: { language: locale } });
      const document = {
        cookie: '',
        querySelectorAll: (selector: string) => selector === '.lang-option' ? [link] : [],
      };
      runInNewContext(script, { document, location: { protocol } });
      link.dispatchEvent(new Event('click'));
      assert.equal(document.cookie.includes('; Secure'), protocol === 'https:');
      const res = await request('/about/', 'de', document.cookie.split(';')[0]).response;
      assert.equal(res.headers.get('Location'), locale === 'en' ? null : `https://example.com/${locale}/about/`);
    }
  }
});
