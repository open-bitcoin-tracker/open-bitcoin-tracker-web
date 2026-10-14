export type PartyPlaybackState = {
  hasTracks: boolean;
  playing: boolean;
  canPrevious: boolean;
  canNext: boolean;
  trackName: string;
  trackIndex: number;
  trackCount: number;
};

type PartyPlaybackError = 'unsupportedFiles' | 'playbackFailed' | 'visualizerUnavailable';
type PartyPlaylistCallbacks = {
  onState(state: PartyPlaybackState): void;
  onError(error: PartyPlaybackError): void;
  onAnalyser(analyser: AnalyserNode | undefined): void;
};

const AUDIO_EXTENSION = /\.(?:mp3|wav|wave|ogg|oga|m4a|aac|flac|opus|weba|webm)$/i;

function isAudioFile(file: File): boolean {
  const type = file.type.toLowerCase();
  return type.startsWith('audio/')
    || ((!type || type === 'application/octet-stream') && AUDIO_EXTENSION.test(file.name));
}

/** Play local files directly; only the active track needs an object URL. */
export function createPartyPlaylist(audio: HTMLAudioElement, callbacks: PartyPlaylistCallbacks) {
  let files: File[] = [];
  let index = -1;
  let activeUrl: string | undefined;
  let wantsPlayback = false;
  let generation = 0;
  let destroyed = false;
  let graphAttempted = false;
  let context: AudioContext | undefined;
  let source: MediaElementAudioSourceNode | undefined;
  let analyser: AnalyserNode | undefined;

  audio.autoplay = false;
  audio.loop = false;
  audio.preload = 'metadata';

  function emitState() {
    if (destroyed) return;
    callbacks.onState({
      hasTracks: files.length > 0,
      playing: wantsPlayback && !audio.paused && !audio.ended,
      canPrevious: index > 0,
      canNext: index >= 0 && index < files.length - 1,
      trackName: files[index]?.name ?? '',
      trackIndex: index,
      trackCount: files.length,
    });
  }

  function createGraph() {
    if (graphAttempted) return;
    graphAttempted = true;
    const Constructor = globalThis.AudioContext
      ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    try {
      if (!Constructor) throw new Error('Web Audio is unavailable');
      context = new Constructor();
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.25;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -5;
      source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      callbacks.onAnalyser(analyser);
    } catch {
      // If the media source was already created, preserve an audible route.
      analyser?.disconnect();
      analyser = undefined;
      if (source && context) {
        source.disconnect();
        source.connect(context.destination);
      } else if (context) {
        void context.close().catch(() => {});
        context = undefined;
      }
      callbacks.onAnalyser(undefined);
      callbacks.onError('visualizerUnavailable');
    }
  }

  function failPlayback(token: number) {
    if (destroyed || token !== generation) return;
    wantsPlayback = false;
    generation++;
    audio.pause();
    emitState();
    callbacks.onError('playbackFailed');
  }

  async function startPlayback() {
    if (destroyed || index < 0) return;
    const token = ++generation;
    wantsPlayback = true;
    createGraph();
    try {
      // Start both operations before awaiting, preserving the user's gesture.
      const resumed = context && context.state !== 'running' ? context.resume() : Promise.resolve();
      const started = audio.play();
      await Promise.all([resumed, started]);
      if (!destroyed && token === generation) emitState();
    } catch {
      failPlayback(token);
    }
  }

  function setTrack(nextIndex: number, nextFiles = files): boolean {
    let nextUrl: string;
    try {
      nextUrl = URL.createObjectURL(nextFiles[nextIndex]);
    } catch {
      callbacks.onError('playbackFailed');
      return false;
    }
    generation++;
    wantsPlayback = false;
    audio.pause();
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    files = nextFiles;
    index = nextIndex;
    activeUrl = nextUrl;
    audio.src = nextUrl;
    let failed = false;
    try {
      audio.load();
    } catch {
      failed = true;
    }
    emitState();
    if (failed) callbacks.onError('playbackFailed');
    return true;
  }

  function move(direction: -1 | 1) {
    if (destroyed) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= files.length) return;
    const continuePlaying = wantsPlayback;
    if (setTrack(nextIndex) && continuePlaying) void startPlayback();
  }

  function handlePlay() {
    if (!wantsPlayback) audio.pause();
    emitState();
  }

  function handlePause() {
    // A queued pause from the old source must not cancel the new source's play.
    if (audio.paused && !audio.ended) {
      wantsPlayback = false;
      generation++;
    }
    emitState();
  }

  function handleEnded() {
    if (!audio.ended || index < 0) return;
    if (wantsPlayback && index < files.length - 1) {
      move(1);
    } else {
      wantsPlayback = false;
      generation++;
      emitState();
    }
  }

  function handleError() {
    // load() clears audio.error, so an old queued error cannot fail a new file.
    if (index >= 0 && audio.error) failPlayback(generation);
  }

  audio.addEventListener('play', handlePlay);
  audio.addEventListener('playing', handlePlay);
  audio.addEventListener('pause', handlePause);
  audio.addEventListener('ended', handleEnded);
  audio.addEventListener('error', handleError);
  emitState();

  return {
    selectFiles(selected: File[]): boolean {
      if (destroyed) return false;
      if (!selected.length) return false;
      const accepted = selected.filter(isAudioFile);
      if (!accepted.length) {
        callbacks.onError('unsupportedFiles');
        return false;
      }
      return setTrack(0, accepted);
    },
    async toggle(): Promise<void> {
      if (destroyed || index < 0) return;
      if (wantsPlayback) {
        wantsPlayback = false;
        generation++;
        audio.pause();
        emitState();
      } else {
        await startPlayback();
      }
    },
    previous() { move(-1); },
    next() { move(1); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      wantsPlayback = false;
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('playing', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.removeAttribute('src');
      try { audio.load(); } catch { /* Teardown must also work after a media failure. */ }
      if (activeUrl) URL.revokeObjectURL(activeUrl);
      activeUrl = undefined;
      files = [];
      source?.disconnect();
      analyser?.disconnect();
      callbacks.onAnalyser(undefined);
      if (context) void context.close().catch(() => {});
    },
  };
}
