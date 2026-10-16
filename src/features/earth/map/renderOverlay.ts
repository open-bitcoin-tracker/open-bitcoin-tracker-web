import type { viewportOverlay } from './mapOverlay';

type ProjectedOverlay = ReturnType<typeof viewportOverlay>;

export function renderOverlay(
  path: SVGPathElement,
  projected: ProjectedOverlay,
) {
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
}
