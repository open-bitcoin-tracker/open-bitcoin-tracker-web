import type { viewportOverlay } from './mapOverlay';

type ProjectedOverlay = ReturnType<typeof viewportOverlay>;

export function renderOverlay(
  path: SVGPathElement,
  readout: HTMLElement | null,
  projected: ProjectedOverlay,
) {
  // Read layout before changing the SVG or readout position. The perimeter
  // supplies its dimensions, avoiding an SVG getBBox/layout flush per frame.
  const readoutWidth = readout?.offsetWidth ?? 0;
  const readoutHeight = readout?.offsetHeight ?? 0;

  if (path.getAttribute('d') !== projected.path) {
    path.setAttribute('d', projected.path);
  }
  path.style.display = projected.path ? '' : 'none';
  const svg = path.ownerSVGElement;
  if (svg) {
    const clip = projected.clip;
    svg.style.clipPath = clip
      ? `circle(${clip.radius}px at ${clip.x}px ${clip.y}px)`
      : '';
  }

  if (!readout) return;
  const anchor = projected.bottomLeft;
  const offscreenApproximation =
    projected.overlay.approximate &&
    anchor &&
    (anchor.x < 0 ||
      anchor.x + readoutWidth + 32 > projected.viewportWidth ||
      anchor.y > projected.viewportHeight ||
      anchor.y - readoutHeight - 32 < 0);
  readout.classList.toggle(
    'result-anchored',
    !!anchor && !offscreenApproximation,
  );
  if (anchor && !offscreenApproximation) {
    readout.style.left = `${anchor.x + 16}px`;
    readout.style.top = `${anchor.y - 16}px`;
    readout.style.visibility =
      projected.width >= readoutWidth + 32 &&
      projected.height >= readoutHeight + 32
        ? ''
        : 'hidden';
  } else {
    readout.style.removeProperty('left');
    readout.style.removeProperty('top');
    readout.style.removeProperty('visibility');
  }
}
