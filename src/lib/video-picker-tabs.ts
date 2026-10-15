import { parseYouTubeVideo, type YouTubeVideo } from './youtube-player';
import type { VideoCopy } from '../i18n/video';
import { videoSuggestions } from './video-suggestions';

const RECENTS_KEY = 'obt-video-recents';

type PickerOptions = {
  copy: Pick<VideoCopy, 'load' | 'removeRecent' | 'recentTitleLoading' | 'recentTitleUnavailable'>;
  onSelect(video: YouTubeVideo): void;
};

function canonicalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const video = parseYouTubeVideo(value);
  if (video) return `https://www.youtube.com/watch?v=${video.id}${video.startSeconds > 0 ? `&t=${video.startSeconds}s` : ''}`;
}

function validTitle(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500);
}

/** Local URL history and keyboard-accessible tabs inside the video picker. */
export function createVideoPickerTabs(root: HTMLElement, { copy, onSelect }: PickerOptions) {
  const tabs = [
    root.querySelector<HTMLButtonElement>('[data-video-tab="recent"]')!,
    root.querySelector<HTMLButtonElement>('[data-video-tab="suggestions"]')!,
  ];
  const panels = [
    root.querySelector<HTMLElement>('[data-video-panel="recent"]')!,
    root.querySelector<HTMLElement>('[data-video-panel="suggestions"]')!,
  ];
  const list = root.querySelector<HTMLUListElement>('[data-video-recents]')!;
  let destroyed = false;
  let activeTab = 1;
  let urls: string[] = [];
  let renderPending = false;
  let opened = false;
  const titles = new Map<string, string>(videoSuggestions.map(video => [video.id, video.title]));
  const titleRequests = new Map<string, Promise<string | undefined>>();
  const titleController = new AbortController();
  let hydrateTitles: (() => void)[] = [];

  try {
    const saved = JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? 'null');
    if (saved?.version === 1 && Array.isArray(saved.urls)) {
      urls = [...new Set<string>(saved.urls.map(canonicalUrl).filter((url: string | undefined): url is string => !!url))];
      for (const url of urls) {
        const id = parseYouTubeVideo(url)!.id;
        const title = validTitle(saved.titles?.[id]);
        if (title) titles.set(id, title);
      }
    }
  } catch { /* A missing or unreadable history leaves the picker usable. */ }

  function selectTab(index: number, focus = false) {
    if (destroyed) return;
    if (index === 0 && !urls.length) index = 1;
    activeTab = index;
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (focus) tabs[index].focus();
    if (opened && index === 0) hydrateTitles.forEach(hydrate => hydrate());
  }

  function save() {
    const cachedTitles = Object.fromEntries(urls.flatMap(url => {
      const id = parseYouTubeVideo(url)!.id;
      const title = titles.get(id);
      return title ? [[id, title]] : [];
    }));
    try { window.localStorage.setItem(RECENTS_KEY, JSON.stringify({ version: 1, urls, ...(Object.keys(cachedTitles).length ? { titles: cachedTitles } : {}) })); }
    catch { /* History remains available for this visit when storage is blocked. */ }
  }

  function fetchTitle(id: string): Promise<string | undefined> {
    const pending = titleRequests.get(id);
    if (pending) return pending;
    const request = (async () => {
      try {
        const videoUrl = `https://www.youtube.com/watch?v=${id}`;
        const response = await fetch(`https://www.youtube.com/oembed?${new URLSearchParams({ url: videoUrl, format: 'json' })}`, {
          credentials: 'omit', referrerPolicy: 'no-referrer',
          signal: AbortSignal.any([titleController.signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok) return;
        const title = validTitle((await response.json()).title);
        if (destroyed || !title || !urls.some(url => parseYouTubeVideo(url)!.id === id)) return;
        titles.set(id, title);
        save();
        return title;
      } catch { /* Private, deleted, offline, or restricted videos retain their thumbnail and controls. */ }
    })();
    titleRequests.set(id, request);
    return request;
  }

  function render() {
    renderPending = false;
    list.replaceChildren();
    hydrateTitles = [];
    tabs[0].hidden = urls.length === 0;
    if (!urls.length && activeTab === 0) selectTab(1);
    const deleteButtons: HTMLButtonElement[] = [];
    for (const [index, url] of urls.entries()) {
      const id = parseYouTubeVideo(url)!.id;
      const row = document.createElement('li');
      row.className = 'video-recent';
      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'video-recent-load';
      load.dataset.recentVideo = url;
      const thumbnail = document.createElement('img');
      thumbnail.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      thumbnail.width = 480;
      thumbnail.height = 360;
      thumbnail.alt = '';
      thumbnail.loading = 'lazy';
      thumbnail.decoding = 'async';
      thumbnail.referrerPolicy = 'no-referrer';
      const title = document.createElement('span');
      title.className = 'video-recent-title';
      load.append(thumbnail, title);
      load.addEventListener('click', () => {
        if (destroyed) return;
        const video = parseYouTubeVideo(url);
        if (!video) return;
        onSelect(video);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'video-recent-delete';
      remove.dataset.removeRecent = url;
      remove.title = copy.removeRecent;
      remove.setAttribute('aria-label', `${copy.removeRecent}: ${url}`);
      const showTitle = (value?: string) => {
        title.textContent = value ?? copy.recentTitleLoading;
        load.title = value ?? url;
        load.setAttribute('aria-label', `${copy.load}: ${value ?? url}`);
        remove.setAttribute('aria-label', `${copy.removeRecent}: ${value ?? url}`);
      };
      showTitle(titles.get(id));
      let requested = false;
      hydrateTitles.push(() => {
        if (requested || titles.has(id) || destroyed) return;
        requested = true;
        void fetchTitle(id).then(value => {
          if (destroyed) return;
          if (value) showTitle(value);
          else title.textContent = copy.recentTitleUnavailable;
        });
      });
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [name, value] of Object.entries({ width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) icon.setAttribute(name, value);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6');
      icon.append(path);
      remove.append(icon);
      remove.addEventListener('click', () => {
        if (destroyed) return;
        urls = urls.filter(value => value !== url);
        save();
        const remaining = render();
        (remaining[Math.min(index, remaining.length - 1)] ?? tabs[1]).focus();
      });
      deleteButtons.push(remove);
      row.append(load, remove);
      list.append(row);
    }
    return deleteButtons;
  }

  function refresh() {
    if (destroyed) return;
    opened = true;
    if (renderPending) {
      render();
      selectTab(urls.length ? 0 : 1);
    } else if (activeTab === 0) hydrateTitles.forEach(hydrate => hydrate());
  }

  function remember(value: string, { deferRender = false } = {}) {
    if (destroyed) return;
    const url = canonicalUrl(value);
    if (!url) return;
    urls = [url, ...urls.filter(previous => previous !== url)];
    save();
    renderPending = true;
    if (!deferRender) refresh();
  }

  const handlers = tabs.map((tab, index) => {
    const onClick = () => selectTab(index);
    const onKeyDown = (event: KeyboardEvent) => {
      if (destroyed || tab.hidden) return;
      const visible = tabs.map((_, i) => i).filter(i => !tabs[i].hidden);
      const current = visible.indexOf(index);
      const next = event.key === 'Home' ? visible[0] : event.key === 'End' ? visible.at(-1)
        : event.key === 'ArrowRight' ? visible[(current + 1) % visible.length]
        : event.key === 'ArrowLeft' ? visible[(current + visible.length - 1) % visible.length] : undefined;
      if (next === undefined) return;
      event.preventDefault();
      selectTab(next, true);
    };
    tab.disabled = false;
    tab.addEventListener('click', onClick);
    tab.addEventListener('keydown', onKeyDown);
    return { onClick, onKeyDown };
  });
  render();
  selectTab(urls.length ? 0 : 1);

  return {
    remember,
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      titleController.abort();
      tabs.forEach((tab, index) => {
        tab.removeEventListener('click', handlers[index].onClick);
        tab.removeEventListener('keydown', handlers[index].onKeyDown);
      });
    },
  };
}
