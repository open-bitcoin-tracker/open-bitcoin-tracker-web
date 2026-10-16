import { describe, expect, it, vi } from 'vitest';
import type { viewportOverlay } from './mapOverlay';
import { renderOverlay } from './renderOverlay';

type Projection = ReturnType<typeof viewportOverlay>;

function frame(overrides: Partial<Projection> = {}): Projection {
  return {
    overlay: { feature: null, bounds: null, measuredKm2: 75.179, approximate: false },
    path: 'M100,100 L500,100 L500,500 L100,500 Z',
    clip: null,
    ...overrides,
  };
}

function element() {
  let current = '';
  return {
    getAttribute: () => current,
    setAttribute: vi.fn((_name: string, value: string) => { current = value; }),
    style: { display: '' },
    ownerSVGElement: { style: { clipPath: '' } },
  } as unknown as SVGPathElement;
}

describe('outline rendering', () => {
  it('draws the outline, avoids redundant path writes and hides an empty outline', () => {
    const path = element();
    renderOverlay(path, frame());
    expect(path.setAttribute).toHaveBeenCalledWith('d', frame().path);
    expect(path.style.display).toBe('');
    renderOverlay(path, frame());
    expect(path.setAttribute).toHaveBeenCalledTimes(1);

    renderOverlay(path, frame({ path: '' }));
    expect(path.getAttribute('d')).toBe('');
    expect(path.style.display).toBe('none');
    renderOverlay(path, frame());
    expect(path.style.display).toBe('');
  });

  it('applies globe clipping and clears it when returning to an unclipped outline', () => {
    const path = element();
    renderOverlay(path, frame({ clip: { x: 400, y: 300, radius: 175 } }));
    expect(path.ownerSVGElement!.style.clipPath).toBe('circle(175px at 400px 300px)');
    renderOverlay(path, frame());
    expect(path.ownerSVGElement!.style.clipPath).toBe('');
  });
});
