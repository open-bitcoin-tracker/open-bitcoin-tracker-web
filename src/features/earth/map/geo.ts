import turfArea from '@turf/area';
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';

export const DEFAULT_CENTER: [number, number] = [-74.006, 40.7128];
export const RADIUS_M = 6_371_008.8; // Same mean spherical Earth radius as Turf.
export const normalizeLongitude = (lng: number) =>
  ((((lng + 180) % 360) + 360) % 360) - 180;

export type Overlay = {
  feature: Feature<Polygon | MultiPolygon> | null;
  bounds: [[number, number], [number, number]] | null;
  measuredKm2: number;
  approximate: boolean;
};

function ring(
  west: number,
  east: number,
  south: number,
  north: number,
): Position[] {
  // Sample parallels along the spherical rectangle's geographic boundary.
  const steps = Math.max(1, Math.ceil((east - west) / 0.2));
  const points: Position[] = [];
  for (let i = 0; i <= steps; i++)
    points.push([west + ((east - west) * i) / steps, south]);
  for (let i = steps; i >= 0; i--)
    points.push([west + ((east - west) * i) / steps, north]);
  points.push(points[0]);
  return points;
}

// Angular height depends only on the amount. Keep one entry so panning can
// reuse the solve without growing a cache as the user edits the calculator.
let lastHeight: { areaKm2: number; height: number } | undefined;
function angularHeight(areaKm2: number): number {
  if (lastHeight?.areaKm2 === areaKm2) return lastHeight.height;
  const targetM2 = areaKm2 * 1e6;
  let low = 0;
  let high = (2 * Math.sqrt(targetM2)) / RADIUS_M;
  for (let i = 0; i < 60; i++) {
    const h = (low + high) / 2;
    const measured = RADIUS_M ** 2 * 2 * h * Math.sin(h / 2);
    if (measured < targetM2) low = h;
    else high = h;
  }
  const height = (low + high) / 2;
  lastHeight = { areaKm2, height };
  return height;
}

export function createOverlay(
  areaKm2: number,
  center: [number, number],
): Overlay {
  const empty: Overlay = {
    feature: null,
    bounds: null,
    measuredKm2: 0,
    approximate: false,
  };
  if (!Number.isFinite(areaKm2) || areaKm2 <= 0) return empty;
  const latitude = center[1];
  if (!Number.isFinite(center[0]) || !Number.isFinite(latitude)) return empty;
  if (Math.abs(latitude) >= 85) {
    return {
      ...empty,
      approximate: true,
    };
  }
  const lat = (latitude * Math.PI) / 180;
  // A north/south side R*h and east/west side R*cos(lat)*width match at center.
  // Exact spherical rectangle area = R² * width * (sin(north) - sin(south)).
  // With width=h/cos(lat), this is R² * 2*h*sin(h/2), independent of latitude.
  const h = angularHeight(areaKm2);
  const halfLat = (h * 90) / Math.PI;
  const halfLng = ((h / Math.cos(lat)) * 90) / Math.PI;
  const south = latitude - halfLat;
  const north = latitude + halfLat;
  if (south < -85 || north > 85 || halfLng >= 90)
    return {
      ...empty,
      approximate: true,
    };
  const lng = normalizeLongitude(center[0]);
  const west = lng - halfLng;
  const east = lng + halfLng;
  // Split at ±180°: avoids a spurious polygon across the whole world.
  const polygons: Position[][][] = [];
  const firstWorld = Math.floor((west + 180) / 360);
  const lastWorld = Math.floor((east + 180) / 360);
  for (let world = firstWorld; world <= lastWorld; world++) {
    const left = Math.max(west, -180 + world * 360);
    const right = Math.min(east, 180 + world * 360);
    if (right > left) {
      const boundary = ring(
        left - world * 360,
        right - world * 360,
        south,
        north,
      );
      polygons.push([boundary]);
    }
  }
  const feature: Feature<Polygon | MultiPolygon> = {
    type: 'Feature',
    properties: {},
    geometry:
      polygons.length === 1
        ? { type: 'Polygon', coordinates: polygons[0] }
        : { type: 'MultiPolygon', coordinates: polygons },
  };
  const measuredKm2 = turfArea(feature) / 1e6;
  // Use the visual scale fallback if this geographic rectangle cannot be verified.
  if (Math.abs(measuredKm2 - areaKm2) / areaKm2 > 0.0001) {
    return {
      ...empty,
      approximate: true,
    };
  }
  return {
    feature,
    bounds: [
      [west, south],
      [east, north],
    ],
    measuredKm2,
    approximate: false,
  };
}
