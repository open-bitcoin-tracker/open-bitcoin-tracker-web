import { isCurrency, type Currency } from './bitcoin-currency';
import { isColour, isFont, type VideoPriceStyleState } from './video-price-style';
import type { VideoPriceLayoutState } from './video-price-layout';
import type { YouTubeVideo } from './youtube-player';

export interface VideoSetup {
  video: YouTubeVideo;
  currency: Currency;
  layout: VideoPriceLayoutState;
  style: VideoPriceStyleState;
  playback: { volume: number; muted: boolean; looping: boolean };
}

export function readVideoSetup(hash: string): VideoSetup | undefined {
  if (hash.length > 2048) return;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('setup') !== '1' || [...params.keys()].some(key => params.getAll(key).length !== 1)) return;
  const id = params.get('video');
  const currency = params.get('currency');
  const colour = params.get('colour');
  const font = params.get('font');
  const strokeColour = params.get('strokeColour');
  const number = (key: string) => params.get(key)?.trim() ? Number(params.get(key)) : NaN;
  const startSeconds = number('start');
  const x = number('x'), y = number('y'), size = number('size');
  const strokeWidth = number('strokeWidth'), volume = number('volume');
  const boolean = (key: string) => ['0', '1'].includes(params.get(key) ?? '');
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id) || !Number.isSafeInteger(startSeconds) || startSeconds < 0
    || !isCurrency(currency) || !isColour(colour) || !isFont(font) || !isColour(strokeColour)
    || ![x, y, size, strokeWidth, volume].every(Number.isFinite)
    || x < 0 || x > 100 || y < 0 || y > 100 || size < 25 || size > Number.MAX_SAFE_INTEGER
    || strokeWidth < .5 || strokeWidth > 6 || !Number.isInteger(strokeWidth * 2)
    || volume < 0 || volume > 100 || !Number.isInteger(volume)
    || !['stroke', 'muted', 'loop'].every(boolean)) return;
  return {
    video: { id, startSeconds }, currency, layout: { x, y, size },
    style: { colour, font, stroke: params.get('stroke') === '1', strokeWidth, strokeColour },
    playback: { volume, muted: params.get('muted') === '1', looping: params.get('loop') === '1' },
  };
}

export function videoSetupHash(setup: VideoSetup): string {
  const { video, currency, layout, style, playback } = setup;
  return `#${new URLSearchParams({
    setup: '1', video: video.id, start: String(video.startSeconds), currency,
    x: String(layout.x), y: String(layout.y), size: String(layout.size),
    colour: style.colour, font: style.font, stroke: style.stroke ? '1' : '0',
    strokeWidth: String(style.strokeWidth), strokeColour: style.strokeColour,
    volume: String(playback.volume), muted: playback.muted ? '1' : '0', loop: playback.looping ? '1' : '0',
  })}`;
}
