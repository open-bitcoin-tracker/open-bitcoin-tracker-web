const IDLE_DELAY = 2500;

/** Fade the playback button only while music plays on devices with a cursor. */
export function createPartyControls(playButton: HTMLButtonElement) {
  const cursor = window.matchMedia('(hover: hover) and (pointer: fine)');
  let playing = false;
  let destroyed = false;
  let timer: number | undefined;

  function clearTimer() {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
  }

  function canFade() {
    return playing && cursor.matches && !document.hidden && !playButton.matches(':focus-visible');
  }

  function reveal() {
    clearTimer();
    playButton.removeAttribute('data-idle');
    if (destroyed || !canFade()) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (canFade()) playButton.setAttribute('data-idle', '');
    }, IDLE_DELAY);
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerType !== 'touch') reveal();
  }

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerdown', reveal);
  window.addEventListener('keydown', reveal);
  playButton.addEventListener('focusin', reveal);
  playButton.addEventListener('focusout', reveal);
  document.addEventListener('visibilitychange', reveal);
  cursor.addEventListener('change', reveal);

  return {
    setPlaying(value: boolean) {
      if (destroyed || playing === value) return;
      playing = value;
      reveal();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', reveal);
      window.removeEventListener('keydown', reveal);
      playButton.removeEventListener('focusin', reveal);
      playButton.removeEventListener('focusout', reveal);
      document.removeEventListener('visibilitychange', reveal);
      cursor.removeEventListener('change', reveal);
      clearTimer();
      playButton.removeAttribute('data-idle');
    },
  };
}
