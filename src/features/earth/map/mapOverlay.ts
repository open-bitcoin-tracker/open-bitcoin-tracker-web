import type { Map } from 'maplibre-gl';
import { createOverlay, normalizeLongitude, RADIUS_M } from './geo';
import type { Overlay } from './geo';

type Project = (point: [number, number]) => { x: number; y: number };
type Clip = { x: number; y: number; radius: number } | null;

function destination(
  [longitude, latitude]: [number, number],
  angle: number,
  bearing: number,
): [number, number] {
  const radians = Math.PI / 180;
  const lat = latitude * radians;
  const north = Math.asin(
    Math.max(
      -1,
      Math.min(
        1,
        Math.sin(lat) * Math.cos(angle) +
          Math.cos(lat) * Math.sin(angle) * Math.cos(bearing),
      ),
    ),
  );
  const offset =
    Math.atan2(
      Math.sin(bearing) * Math.sin(angle) * Math.cos(lat),
      Math.cos(angle) - Math.sin(lat) * Math.sin(north),
    ) / radians;
  return [longitude + normalizeLongitude(offset), north / radians];
}

function approximateOutline(
  areaKm2: number,
  center: [number, number],
  project: Project,
  curved: boolean,
) {
  const origin = project(center);
  // Calibrate against nearby points, so small areas retain the local map scale
  // even where the old geographic rectangle crosses a polar boundary.
  const angle = 1e-5;
  const east = project(destination(center, angle, Math.PI / 2));
  const west = project(destination(center, angle, -Math.PI / 2));
  const north = project(destination(center, angle, 0));
  const south = project(destination(center, angle, Math.PI));
  const side = Math.sqrt(areaKm2) * 1000;
  const width =
    (side * Math.hypot(east.x - west.x, east.y - west.y)) /
    (2 * angle * RADIUS_M);
  const height =
    (side * Math.hypot(north.x - south.x, north.y - south.y)) /
    (2 * angle * RADIUS_M);
  const left = origin.x - width / 2;
  const right = origin.x + width / 2;
  const top = origin.y - height / 2;
  const bottom = origin.y + height / 2;
  let clip: Clip = null;
  if (curved) {
    // The extremum of a projected meridian/equator traces the globe's rim.
    // At close zooms its radius grows beyond the viewport, leaving it unclipped.
    let radius = 0;
    for (let bearing = 0; bearing < 2 * Math.PI; bearing += Math.PI / 2) {
      for (let step = 1; step <= 90; step++) {
        const point = project(
          destination(center, (step * Math.PI) / 180, bearing),
        );
        const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
        if (Number.isFinite(distance)) radius = Math.max(radius, distance);
      }
    }
    if (radius > 0) clip = { x: origin.x, y: origin.y, radius };
  }
  return {
    path: `M${left},${top} L${right},${top} L${right},${bottom} L${left},${bottom} Z`,
    clip,
  };
}

const mercatorLatitude = (latitude: number) =>
  Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));

export function createCenteredOverlay(
  areaKm2: number,
  viewportCenter: [number, number],
  project?: Project,
) {
  const initial = createOverlay(areaKm2, viewportCenter);
  if (!initial.bounds) return initial;
  const halfLatitude = (initial.bounds[1][1] - initial.bounds[0][1]) / 2;
  if (project) {
    // On a globe, parallels curve. Center their projected extrema, rather than
    // applying the flat map's Mercator latitude correction.
    const [longitude, latitude] = viewportCenter;
    const halfLongitude = (initial.bounds[1][0] - initial.bounds[0][0]) / 2;
    const longitudeScale = halfLongitude * Math.cos((latitude * Math.PI) / 180);
    const latitudeLimit = Math.min(
      85 - halfLatitude,
      (Math.acos(longitudeScale / 90) * 180) / Math.PI - 1e-8,
    );
    let low = Math.max(-latitudeLimit, latitude - halfLatitude);
    let high = Math.min(latitudeLimit, latitude + halfLatitude);
    const target = project(viewportCenter).y;
    for (let i = 0; i < 32; i++) {
      const candidate = (low + high) / 2;
      const width = longitudeScale / Math.cos((candidate * Math.PI) / 180);
      const ys = [-width, 0, width].flatMap((offset) => [
        project([longitude + offset, candidate - halfLatitude]).y,
        project([longitude + offset, candidate + halfLatitude]).y,
      ]);
      const midpoint = (Math.min(...ys) + Math.max(...ys)) / 2;
      if (Math.abs(midpoint - target) < 0.001)
        return createOverlay(areaKm2, [longitude, candidate]);
      if (midpoint > target) low = candidate;
      else high = candidate;
    }
    return createOverlay(areaKm2, [longitude, (low + high) / 2]);
  }
  const target = mercatorLatitude(viewportCenter[1]);
  // Mercator is nonlinear: center the projected edges while retaining the exact surface area.
  let low = -85 + halfLatitude;
  let high = 85 - halfLatitude;
  for (let i = 0; i < 40; i++) {
    const latitude = (low + high) / 2;
    const midpoint =
      (mercatorLatitude(latitude - halfLatitude) +
        mercatorLatitude(latitude + halfLatitude)) /
      2;
    if (midpoint < target) low = latitude;
    else high = latitude;
  }
  return createOverlay(areaKm2, [viewportCenter[0], (low + high) / 2]);
}

export function viewportOverlay(map: Map, areaKm2: number) {
  const canvas = map.getCanvas();
  const point = map.unproject([
    canvas.clientWidth / 2,
    canvas.clientHeight / 2,
  ]);
  const center: [number, number] = [normalizeLongitude(point.lng), point.lat];
  // Keep compact date-line bounds in the camera's world at close-up zooms.
  const worldOffset = 360 * Math.round((map.getCenter().lng - center[0]) / 360);
  const project: Project = ([lng, lat]) =>
    map.project([lng + worldOffset, lat]);
  // MapLibre's globe preset becomes fully Mercator at zoom 12. Match its
  // active transform so the outline stays aligned at street-level zooms.
  const curved = map.getZoom() < 12;
  const overlay = createCenteredOverlay(
    areaKm2,
    center,
    curved ? project : undefined,
  );
  const path = overlayPath(overlay.bounds, project, curved);
  // Keep the established geographic square and its screen centering wherever
  // it works. A valid amount always gets a visual scale square otherwise.
  if (Number.isFinite(areaKm2) && areaKm2 > 0 && !path) {
    return {
      overlay: { ...overlay, approximate: true },
      ...approximateOutline(areaKm2, center, project, curved),
    };
  }
  return {
    overlay,
    path,
    clip: null as Clip,
  };
}

export function overlayPath(
  bounds: Overlay['bounds'],
  project: Project,
  curved: boolean,
) {
  if (!bounds) return '';
  const [[west, south], [east, north]] = bounds;
  // Sampling all four edges lets both parallels and meridians follow the sphere.
  // Unwrapped bounds avoid a stroke along the artificial date-line split.
  const corners: [number, number][] = [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
  const commands: string[] = [];
  for (let edge = 0; edge < 4; edge++) {
    const from = corners[edge];
    const to = corners[(edge + 1) % 4];
    const steps = curved
      ? Math.max(
          4,
          Math.ceil(
            Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) /
              0.25,
          ),
        )
      : 1;
    for (let step = 0; step < steps; step++) {
      const fraction = step / steps;
      const { x, y } = project([
        from[0] + (to[0] - from[0]) * fraction,
        from[1] + (to[1] - from[1]) * fraction,
      ]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
      commands.push(`${commands.length === 0 ? 'M' : 'L'}${x},${y}`);
    }
  }
  return commands.join(' ') + ' Z';
}

export function followViewportCenter(
  map: Map,
  onCenter: (center: [number, number]) => void,
) {
  const update = () => {
    const canvas = map.getCanvas();
    // Sample the actual screen center so camera padding cannot offset the area.
    const point = map.unproject([
      canvas.clientWidth / 2,
      canvas.clientHeight / 2,
    ]);
    const center: [number, number] = [normalizeLongitude(point.lng), point.lat];
    onCenter(center);
  };
  map.on('move', update);
  map.on('resize', update);
  update();
  return () => {
    map.off('move', update);
    map.off('resize', update);
  };
}
