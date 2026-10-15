import { describe, expect, it, vi } from 'vitest';
import type { viewportOverlay } from './mapOverlay';
import { renderOverlay } from './renderOverlay';

type Projection = ReturnType<typeof viewportOverlay>;

function frame(overrides: Partial<Projection> = {}): Projection {
  return {
    overlay: { feature: null, bounds: null, measuredKm2: 75.179, approximate: false },
    path: 'M100,100 L500,100 L500,500 L100,500 Z',
    width: 400,
    height: 400,
    bottomLeft: { x: 100, y: 500 },
    clip: null,
    viewportWidth: 800,
    viewportHeight: 600,
    ...overrides,
  };
}

function elements() {
  const style = {
    visibility: 'hidden',
    left: '',
    top: '',
    removeProperty(key: string) {
      if (key === 'left' || key === 'top') this[key] = '';
      return '';
    },
  };
  const readout = {
    offsetWidth: 120,
    offsetHeight: 48,
    style,
    classList: { toggle: vi.fn() },
  } as unknown as HTMLElement;
  const path = {
    getAttribute: () => '',
    setAttribute: vi.fn(),
    style: { display: '' },
    ownerSVGElement: { style: { clipPath: '' } },
  } as unknown as SVGPathElement;
  return { path, readout };
}

describe('readout follows the visible area', () => {
  it('appears at the lower-left corner only with an outline, then hides when it clears', () => {
    const { path, readout } = elements();
    renderOverlay(path, readout, frame());
    expect(readout.style).toMatchObject({ visibility: 'visible', left: '116px', top: '484px' });
    expect(readout.classList.toggle).toHaveBeenLastCalledWith('result-anchored', true);

    renderOverlay(path, readout, frame({ path: '', width: 0, height: 0, bottomLeft: null }));
    expect(path.style.display).toBe('none');
    expect(readout.style).toMatchObject({ visibility: 'hidden', left: '', top: '' });
    expect(readout.classList.toggle).toHaveBeenLastCalledWith('result-anchored', false);
  });

  it('stays hidden at small zooms and returns when the area can contain the text', () => {
    const { path, readout } = elements();
    renderOverlay(path, readout, frame({ width: 151, height: 79 }));
    expect(readout.style.visibility).toBe('hidden');
    renderOverlay(path, readout, frame());
    expect(readout.style.visibility).toBe('visible');
  });

  it.each([
    { x: -10, y: 500 },
    { x: 700, y: 500 },
    { x: 100, y: 650 },
    { x: 100, y: 60 },
  ])('hides the label when its corner is outside the viewport: %j', (bottomLeft) => {
    const { path, readout } = elements();
    for (const approximate of [false, true]) {
      renderOverlay(path, readout, frame({
        bottomLeft,
        overlay: { ...frame().overlay, approximate },
      }));
      expect(readout.style.visibility).toBe('hidden');
    }
  });

  it('does not show a floating screen label when an outline or anchor is unavailable', () => {
    const { path, readout } = elements();
    for (const overrides of [{ path: '' }, { bottomLeft: null }]) {
      renderOverlay(path, readout, frame(overrides));
      expect(readout.style.visibility).toBe('hidden');
    }
  });
});
