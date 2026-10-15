export type YouTubeVideo = { id: string; startSeconds: number };
export type YouTubeProgress = { currentTime: number; duration: number };
export type YouTubeCaptions = { enabled: boolean; available: boolean };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const VIDEO_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const EMBED_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);

function parseStart(value: string | null): number {
  if (!value) return 0;
  const seconds = /^(\d+(?:\.\d+)?)s?$/i.exec(value);
  const duration = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
  const parsed = seconds ? Number(seconds[1]) : duration
    ? Number(duration[1] ?? 0) * 3600 + Number(duration[2] ?? 0) * 60 + Number(duration[3] ?? 0)
    : 0;
  return Number.isSafeInteger(Math.floor(parsed)) ? Math.floor(parsed) : 0;
}

/** Extract only video IDs and start times; never embed an untrusted input URL. */
export function parseYouTubeVideo(input: string): YouTubeVideo | undefined {
  let value = input.trim();
  if (/^(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)(?:\/|$)/i.test(value)) {
    value = `https://${value}`;
  } else if (value.startsWith('//')) {
    value = `https:${value}`;
  }
  let url: URL;
  try { url = new URL(value); } catch { return; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return;
  const path = url.pathname.split('/').filter(Boolean);
  let id: string | null | undefined;
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    if (path.length === 1) id = path[0];
  } else if (VIDEO_HOSTS.has(url.hostname)) {
    if (path.length === 1 && path[0] === 'watch') id = url.searchParams.get('v');
    else if (path.length === 2 && ['embed', 'shorts', 'live', 'v'].includes(path[0])) id = path[1];
  } else if (EMBED_HOSTS.has(url.hostname) && path.length === 2 && path[0] === 'embed') {
    id = path[1];
  }
  if (!id || !VIDEO_ID.test(id)) return;
  const hash = new URLSearchParams(url.hash.slice(1));
  return {
    id,
    startSeconds: parseStart(url.searchParams.get('start') ?? url.searchParams.get('t') ?? hash.get('t') ?? hash.get('start')),
  };
}

type VideoRequest = { videoId: string; startSeconds: number };
type YouTubePlayer = {
  loadVideoById(video: VideoRequest): void;
  cueVideoById(video: VideoRequest): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getOptions?(module?: string): unknown;
  getOption?(module: string, option: string): unknown;
  setOption?(module: string, option: string, value: unknown): void;
  loadModule?(module: string): void;
  unloadModule?(module: string): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
};
type PlayerEvent = { target: YouTubePlayer; data?: number };
type PlayerOptions = {
  width: string;
  height: string;
  host: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady(event: PlayerEvent): void;
    onStateChange(event: PlayerEvent): void;
    onError(event: PlayerEvent): void;
    onAutoplayBlocked(event: PlayerEvent): void;
    onApiChange(event: PlayerEvent): void;
  };
};
type YouTubeApi = { Player: new (container: HTMLElement, options: PlayerOptions) => YouTubePlayer };
type YouTubeWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
type YouTubeCallbacks = {
  onState(playing: boolean): void;
  onError(code?: number): void;
  onReady?(): void;
  onBlocked?(): void;
  onCaptions?(state: YouTubeCaptions): void;
  title?: string;
};

let apiPromise: Promise<YouTubeApi> | undefined;
const API_URL = 'https://www.youtube.com/iframe_api';
const LOAD_TIMEOUT = 20_000;

function loadYouTubeApi(): Promise<YouTubeApi> {
  const scope = window as YouTubeWindow;
  if (scope.YT?.Player) return Promise.resolve(scope.YT);
  if (apiPromise) return apiPromise;
  const pending = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = scope.onYouTubeIframeAPIReady;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${API_URL}"]`);
    const script = existing ?? document.createElement('script');
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      script.removeEventListener('error', fail);
      if (scope.onYouTubeIframeAPIReady === ready) scope.onYouTubeIframeAPIReady = previousReady;
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      reject(new Error('YouTube player could not load'));
    };
    const ready = () => {
      if (settled) return;
      if (!scope.YT?.Player) { fail(); return; }
      settled = true;
      cleanup();
      resolve(scope.YT);
      // Preserve consumers that installed a callback before this module.
      previousReady?.();
    };
    const timeout = setTimeout(fail, LOAD_TIMEOUT);
    scope.onYouTubeIframeAPIReady = ready;
    script.addEventListener('error', fail);
    if (!existing) {
      script.src = API_URL;
      script.async = true;
      try { document.head.append(script); } catch { fail(); }
    }
  });
  apiPromise = pending;
  // A failed request must not poison the shared loader for a later retry.
  void pending.catch(() => { if (apiPromise === pending) apiPromise = undefined; });
  return pending;
}

/** A lazy player with sound enabled. Loading happens only after explicit selection. */
export function createYouTubePlayer(container: HTMLElement, callbacks: YouTubeCallbacks) {
  let player: YouTubePlayer | undefined;
  let selected: YouTubeVideo | undefined;
  let ready = false;
  let initializing = false;
  let destroyed = false;
  let wantsPlayback = false;
  let awaitingSelection = false;
  let muted = false;
  let volume = 100;
  let looping = false;
  let pendingSeek: number | undefined;
  let captionsWanted = false;
  let captionsAvailable = false;
  let captionCommand: 'load' | 'unload' | undefined;
  let lastCaptions: YouTubeCaptions | undefined;
  let readyTimeout: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  function readProgress(): YouTubeProgress {
    if (!ready || !player || !selected || destroyed) return { currentTime: 0, duration: 0 };
    try {
      const rawDuration = player.getDuration();
      const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
      const rawTime = player.getCurrentTime();
      const currentTime = duration && Number.isFinite(rawTime) ? Math.max(0, Math.min(rawTime, duration)) : 0;
      return { currentTime, duration };
    } catch { return { currentTime: 0, duration: 0 }; }
  }
  function applyPendingSeek() {
    if (!ready || !player || pendingSeek === undefined || destroyed) return;
    const { duration } = readProgress();
    if (!duration) return;
    const seconds = Math.min(pendingSeek, duration);
    pendingSeek = undefined;
    try {
      player.seekTo(seconds, true);
      // YouTube can start a cued or ended video on seek; preserve our paused intent.
      if (!wantsPlayback) player.pauseVideo();
    } catch { fail(); }
  }
  function emitCaptions(enabled: boolean, available = captionsAvailable) {
    if (destroyed) return;
    if (lastCaptions?.enabled === enabled && lastCaptions.available === available) return;
    lastCaptions = { enabled, available };
    callbacks.onCaptions?.({ ...lastCaptions });
  }
  // Module toggles exist in current players but are not part of the documented API.
  // Keep them optional so an API change cannot interrupt video playback.
  function canControlCaptions() {
    return player && typeof player.getOptions === 'function'
      && typeof player.loadModule === 'function' && typeof player.unloadModule === 'function';
  }
  function requestCaptionModule() {
    if (!ready || !selected || destroyed || !canControlCaptions() || captionCommand === 'load') return;
    try {
      captionCommand = 'load';
      player!.loadModule!('captions');
    } catch {
      captionCommand = undefined;
      emitCaptions(false, false);
    }
  }
  function refreshCaptions() {
    if (!ready || !selected || destroyed || !canControlCaptions()) { emitCaptions(false, false); return; }
    try {
      const modules = player!.getOptions!();
      const loaded = Array.isArray(modules) && modules.includes('captions');
      if (loaded) {
        if (captionCommand === 'load') captionCommand = undefined;
        // Some player versions expose tracklist; module presence is the fallback.
        let tracks: unknown;
        try { tracks = player!.getOption?.('captions', 'tracklist'); } catch { /* Fall back to module discovery. */ }
        if (!Array.isArray(tracks) || tracks.length > 0) captionsAvailable = true;
        if (!captionsWanted && captionsAvailable && captionCommand !== 'unload') {
          captionCommand = 'unload';
          // Clear YouTube's selected track as well as unloading the module:
          // some players retain captions enabled by their own preferences.
          try { player!.setOption?.('captions', 'track', {}); } catch { /* Module unload remains the fallback. */ }
          player!.unloadModule!('captions');
        }
      } else {
        if (captionCommand === 'unload') captionCommand = undefined;
        if (captionsWanted) requestCaptionModule();
      }
      emitCaptions(captionsWanted && loaded && captionsAvailable);
    } catch { emitCaptions(false, false); }
  }

  function stopState() {
    if (!destroyed) callbacks.onState(false);
  }
  function fail(code?: number) {
    if (destroyed) return;
    wantsPlayback = false;
    awaitingSelection = false;
    stopState();
    callbacks.onError(code);
  }
  function updateIframe() {
    const iframe = player?.getIframe();
    if (!iframe) return;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.tabIndex = -1;
    if (callbacks.title) iframe.title = callbacks.title;
  }
  function applySelection() {
    if (!ready || !player || !selected || destroyed) return;
    try {
      player.setVolume(volume);
      if (muted) player.mute(); else player.unMute();
      const request = { videoId: selected.id, startSeconds: selected.startSeconds };
      if (wantsPlayback) player.loadVideoById(request);
      else player.cueVideoById(request);
      requestCaptionModule();
    } catch { fail(); }
  }
  function resetFailedPlayer(code?: number) {
    generation++;
    clearTimeout(readyTimeout);
    readyTimeout = undefined;
    ready = false;
    initializing = false;
    captionsAvailable = false;
    captionCommand = undefined;
    emitCaptions(false);
    try { player?.destroy(); } catch { /* The failed iframe may already be gone. */ }
    player = undefined;
    container.replaceChildren();
    fail(code);
  }
  async function initialize() {
    if (destroyed || initializing || player) return;
    initializing = true;
    const token = ++generation;
    try {
      const api = await loadYouTubeApi();
      if (destroyed || token !== generation) return;
      const mount = document.createElement('div');
      container.replaceChildren(mount);
      readyTimeout = setTimeout(() => {
        if (!destroyed && token === generation) resetFailedPlayer();
      }, LOAD_TIMEOUT);
      player = new api.Player(mount, {
        width: '100%', height: '100%', host: 'https://www.youtube-nocookie.com',
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, fs: 0, rel: 0, cc_load_policy: 0, origin: window.location.origin },
        events: {
          onReady(event) {
            if (destroyed || token !== generation) return;
            clearTimeout(readyTimeout);
            readyTimeout = undefined;
            player = event.target;
            ready = true;
            initializing = false;
            updateIframe();
            applySelection();
            applyPendingSeek();
            refreshCaptions();
            callbacks.onReady?.();
          },
          onStateChange(event) {
            if (destroyed || token !== generation) return;
            if (event.data === 1) {
              awaitingSelection = false;
              if (!wantsPlayback) { player?.pauseVideo(); return; }
              applyPendingSeek();
              refreshCaptions();
              if (wantsPlayback) callbacks.onState(true);
            } else if (event.data === 0) {
              awaitingSelection = false;
              stopState();
              if (wantsPlayback && looping) {
                pendingSeek = undefined;
                try { player?.seekTo(0, true); player?.playVideo(); } catch { fail(); }
              } else {
                wantsPlayback = false;
              }
            } else if (event.data === 2) {
              // loadVideoById can emit a pause for the previous video before the
              // new selection starts. Only explicit pause() can cancel that intent.
              if (!awaitingSelection) wantsPlayback = false;
              stopState();
            } else if (event.data === -1 || event.data === 5) {
              if (event.data === 5) {
                if (!wantsPlayback) awaitingSelection = false;
                applyPendingSeek();
                refreshCaptions();
              }
              stopState();
            }
          },
          onApiChange() {
            if (destroyed || token !== generation) return;
            refreshCaptions();
          },
          onError(event) {
            if (destroyed || token !== generation) return;
            const code = typeof event.data === 'number' && Number.isFinite(event.data) ? event.data : undefined;
            if (ready) fail(code); else resetFailedPlayer(code);
          },
          onAutoplayBlocked() {
            if (destroyed || token !== generation) return;
            wantsPlayback = false;
            stopState();
            callbacks.onBlocked?.();
          },
        },
      });
      updateIframe();
    } catch {
      if (!destroyed && token === generation) resetFailedPlayer();
    }
  }

  stopState();
  emitCaptions(false);
  return {
    load(video: YouTubeVideo) {
      if (destroyed || !VIDEO_ID.test(video.id) || !Number.isFinite(video.startSeconds) || video.startSeconds < 0) return;
      selected = { id: video.id, startSeconds: Math.floor(video.startSeconds) };
      pendingSeek = undefined;
      captionsAvailable = false;
      captionCommand = undefined;
      emitCaptions(false);
      wantsPlayback = true;
      awaitingSelection = true;
      stopState();
      if (ready) applySelection();
      else void initialize();
    },
    play() {
      if (destroyed || !selected) return;
      wantsPlayback = true;
      if (ready) {
        try { player?.playVideo(); } catch { fail(); }
      } else void initialize();
    },
    pause() {
      if (destroyed) return;
      wantsPlayback = false;
      awaitingSelection = false;
      if (ready) {
        try { player?.pauseVideo(); } catch { fail(); }
      }
      stopState();
    },
    getProgress(): YouTubeProgress {
      applyPendingSeek();
      return readProgress();
    },
    seekTo(seconds: number) {
      if (destroyed || !selected || !Number.isFinite(seconds)) return;
      pendingSeek = Math.max(0, seconds);
      applyPendingSeek();
    },
    setLoop(value: boolean) { if (!destroyed) looping = value; },
    setCaptions(value: boolean) {
      if (destroyed) return;
      captionsWanted = value;
      if (value) requestCaptionModule();
      refreshCaptions();
    },
    setVolume(value: number) {
      if (destroyed || !Number.isFinite(value)) return;
      volume = Math.round(Math.max(0, Math.min(value, 100)));
      if (!ready || !player) return;
      try { player.setVolume(volume); } catch { fail(); }
    },
    setMuted(value: boolean) {
      if (destroyed) return;
      muted = value;
      if (!ready || !player) return;
      try { if (muted) player.mute(); else player.unMute(); } catch { fail(); }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      clearTimeout(readyTimeout);
      try { player?.destroy(); } catch { /* Cleanup remains safe after a failed embed. */ }
      player = undefined;
      selected = undefined;
      pendingSeek = undefined;
      container.replaceChildren();
    },
  };
}
