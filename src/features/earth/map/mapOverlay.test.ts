import { describe, expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import { createOverlay } from './geo';
import { LAND_KM2, toArea } from '../lib/bitcoin';
import {
  createCenteredOverlay,
  followViewportCenter,
  overlayPath,
  viewportOverlay,
} from './mapOverlay';

function setup() {
  const listeners = new globalThis.Map<string, () => void>();
  const canvas = { clientWidth: 800, clientHeight: 600 };
  let position = { lng: 0, lat: 0 };
  const map = {
    getCanvas: () => canvas,
    unproject: vi.fn(() => position),
    on: (event: string, handler: () => void) => listeners.set(event, handler),
    off: (event: string) => listeners.delete(event),
  };
  const onCenter = vi.fn();
  const stop = followViewportCenter(map as unknown as Map, onCenter);
  return {
    canvas,
    map,
    onCenter,
    stop,
    listeners,
    moveTo: (lng: number, lat: number) => {
      position = { lng, lat };
      listeners.get('move')?.();
    },
  };
}

describe('area follows the screen center', () => {
  it('centers immediately and follows every camera move without changing the area', () => {
    const { map, onCenter, moveTo } = setup();
    expect(map.unproject).toHaveBeenCalledWith([400, 300]);
    expect(onCenter).toHaveBeenLastCalledWith([0, 0]);
    for (const [lng, lat] of [
      [-0.1276, 51.5072],
      [13.4, 52.5],
      [179.999, -16],
      [181, -16],
    ]) {
      moveTo(lng, lat);
      const center = onCenter.mock.lastCall![0];
      expect(center[1]).toBe(lat);
      expect(center[0]).toBeGreaterThanOrEqual(-180);
      expect(center[0]).toBeLessThan(180);
      expect(createOverlay(toArea(1), center).measuredKm2).toBeCloseTo(
        toArea(1),
        6,
      );
    }
    expect(onCenter).toHaveBeenLastCalledWith([-179, -16]);
  });

  it('samples the new viewport center after resizing and removes listeners on cleanup', () => {
    const { canvas, map, listeners, stop } = setup();
    canvas.clientWidth = 390;
    canvas.clientHeight = 844;
    listeners.get('resize')!();
    expect(map.unproject).toHaveBeenLastCalledWith([195, 422]);
    stop();
    expect(listeners.size).toBe(0);
  });

  it('updates on zoom and resize even when the geographic center has not changed', () => {
    const { onCenter, moveTo, listeners } = setup();
    moveTo(0, 0);
    listeners.get('resize')!();
    expect(onCenter).toHaveBeenCalledTimes(3);
  });

  it('centers the projected edges while preserving surface area at high latitudes and the date line', () => {
    const mercator = (latitude: number) =>
      Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
    for (const area of [toArea(0.00000001), toArea(1), 100_000]) {
      for (const lat of [0, 51.5072, -33.9, 75]) {
        const overlay = createCenteredOverlay(area, [179.999, lat]);
        const [[, south], [, north]] = overlay.bounds!;
        expect((mercator(south) + mercator(north)) / 2).toBeCloseTo(
          mercator(lat),
          10,
        );
        expect(Math.abs(overlay.measuredKm2 / area - 1)).toBeLessThan(0.0001);
      }
    }
    expect(createCenteredOverlay(0, [0, 0]).feature).toBeNull();
    expect(createCenteredOverlay(toArea(1), [0, 90]).approximate).toBe(true);
  });
});

describe('projected globe overlay', () => {
  // A spherical perspective camera looking at the selected latitude/longitude.
  function camera([longitude, latitude]: [number, number]) {
    const radians = Math.PI / 180;
    return ([lng, lat]: [number, number]) => {
      const phi = lat * radians;
      const delta = (lng - longitude) * radians;
      const center = latitude * radians;
      const depth =
        Math.sin(center) * Math.sin(phi) +
        Math.cos(center) * Math.cos(phi) * Math.cos(delta);
      const scale = 300 / (2 - depth);
      return {
        x: 400 + scale * Math.cos(phi) * Math.sin(delta),
        y:
          300 -
          scale *
            (Math.cos(center) * Math.sin(phi) -
              Math.sin(center) * Math.cos(phi) * Math.cos(delta)),
      };
    };
  }

  function pathPoints(path: string) {
    return [...path.matchAll(/[ML]([^, ]+),([^ ]+)/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
    }));
  }

  function testMap(longitude: number, latitude: number, zoom: number) {
    const mercator = (lat: number) =>
      Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const project = camera([longitude, latitude]);
    const scale = 2 ** zoom;
    return {
      getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
      getCenter: () => ({ lng: longitude, lat: latitude }),
      unproject: () => ({ lng: longitude, lat: latitude }),
      getZoom: () => zoom,
      project: ([lng, lat]: [number, number]) => {
        if (zoom < 12) {
          const point = project([lng, lat]);
          return {
            x: 400 + (point.x - 400) * scale,
            y: 300 + (point.y - 300) * scale,
          };
        }
        return {
          x: 400 + (lng - longitude) * scale,
          y:
            300 -
            ((mercator(lat) - mercator(latitude)) * scale * 180) / Math.PI,
        };
      },
    } as unknown as Map;
  }

  it('keeps every positive amount visible across zooms, polar locations and the date line', () => {
    for (const longitude of [0, 179.999, -179.999, 181]) {
      for (const latitude of [0, 51.5072, -33.9, 75, 84, 85, -85]) {
        for (const zoom of [0, 3, 6, 12, 14, 22]) {
          for (const area of [
            toArea(1e-8),
            toArea(1),
            1_000_000,
            10_000_000,
            LAND_KM2,
          ]) {
            const result = viewportOverlay(
              testMap(longitude, latitude, zoom),
              area,
            );
            const points = pathPoints(result.path);
            expect(points.length).toBeGreaterThanOrEqual(4);
            expect(
              points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
            ).toBe(true);
            expect(result.width).toBeGreaterThan(0);
            expect(result.height).toBeGreaterThan(0);
            if (result.overlay.approximate) {
              expect(
                (Math.min(...points.map((p) => p.x)) +
                  Math.max(...points.map((p) => p.x))) /
                  2,
              ).toBeCloseTo(400, 5);
              expect(
                (Math.min(...points.map((p) => p.y)) +
                  Math.max(...points.map((p) => p.y))) /
                  2,
              ).toBeCloseTo(300, 5);
            }
          }
        }
      }
    }
  });

  it('preserves the established geographic outline exactly for supported small amounts', () => {
    for (const latitude of [0, 51.5072, 75]) {
      for (const area of [toArea(1e-8), toArea(1), toArea(100)]) {
        const map = testMap(179.999, latitude, 3);
        const result = viewportOverlay(map, area);
        const original = createCenteredOverlay(
          area,
          [179.999, latitude],
          ([lng, lat]) => map.project([lng, lat]),
        );
        expect(result.path).toBe(
          overlayPath(
            original.bounds,
            ([lng, lat]) => map.project([lng, lat]),
            true,
          ),
        );
        expect(result.overlay.approximate).toBe(false);
        expect(result.clip).toBeNull();
        expect(Math.abs(result.overlay.measuredKm2 / area - 1)).toBeLessThan(
          0.0001,
        );
      }
    }
  });

  it('uses a locally accurate scale for small squares at the map polar boundary', () => {
    const latitude = 85;
    const map = testMap(0, latitude, 14);
    const result = viewportOverlay(map, toArea(1));
    const pixelsPerMetre =
      (2 ** 14 * 180) /
      Math.PI /
      (6_371_008.8 * Math.cos((latitude * Math.PI) / 180));
    const expected = Math.sqrt(toArea(1)) * 1000 * pixelsPerMetre;
    expect(result.overlay.approximate).toBe(true);
    expect(Math.abs(result.width / expected - 1)).toBeLessThan(0.0001);
    expect(Math.abs(result.height / expected - 1)).toBeLessThan(0.0001);
  });

  it('clips the large scale fallback to the globe rim and clears it for small areas', () => {
    const map = testMap(0, 51.5072, 0);
    const result = viewportOverlay(map, LAND_KM2);
    expect(result.overlay.approximate).toBe(true);
    expect(result.clip?.radius).toBeCloseTo(300 / Math.sqrt(3), 2);
    expect(viewportOverlay(map, toArea(1)).clip).toBeNull();
  });

  it('curves the perimeter and keeps the projected area centered and geographically accurate', () => {
    for (const lat of [0, 51.5072, -33.9, 75]) {
      for (const area of [toArea(0.00000001), toArea(1), 100_000, 1_000_000]) {
        const center: [number, number] = [179.999, lat];
        const project = camera(center);
        const overlay = createCenteredOverlay(area, center, project);
        const points = pathPoints(overlayPath(overlay.bounds, project, true));
        expect(points.length).toBeGreaterThan(4);
        expect(Math.abs(overlay.measuredKm2 / area - 1)).toBeLessThan(0.0001);
        expect(
          (Math.min(...points.map((p) => p.x)) +
            Math.max(...points.map((p) => p.x))) /
            2,
        ).toBeCloseTo(400, 2);
        expect(
          (Math.min(...points.map((p) => p.y)) +
            Math.max(...points.map((p) => p.y))) /
            2,
        ).toBeCloseTo(300, 2);
      }
    }
    const project = camera([0, 60]);
    const overlay = createCenteredOverlay(1_000_000, [0, 60], project);
    // The north parallel bows instead of staying a horizontal SVG edge.
    const [[west], [east, north]] = overlay.bounds!;
    expect(project([west, north]).y).not.toBeCloseTo(
      project([(west + east) / 2, north]).y,
      2,
    );
  });

  it('uses one compact perimeter across the date line at globe and close-up zooms', () => {
    for (const curved of [false, true]) {
      const bounds = createOverlay(100_000, [179.999, 0]).bounds!;
      const seen: [number, number][] = [];
      const path = overlayPath(
        bounds,
        (point) => {
          seen.push(point);
          return { x: point[0], y: point[1] };
        },
        curved,
      );
      expect(path.match(/M/g)).toHaveLength(1);
      expect(path.endsWith(' Z')).toBe(true);
      expect(
        Math.max(...seen.map((p) => p[0])) - Math.min(...seen.map((p) => p[0])),
      ).toBeLessThan(10);
      expect(seen.some((p) => p[0] > 180)).toBe(true);
    }
  });

  it('projects areas above the former cutoff through the full supply on the globe', () => {
    for (const area of [1_000_001, 10_000_000, LAND_KM2]) {
      for (const longitude of [0, 179.999, -179.999]) {
        const center: [number, number] = [longitude, 0];
        const project = camera(center);
        const overlay = createCenteredOverlay(area, center, project);
        const points = pathPoints(overlayPath(overlay.bounds, project, true));
        expect(overlay.approximate).toBe(false);
        expect(Math.abs(overlay.measuredKm2 / area - 1)).toBeLessThan(0.0001);
        expect(points.length).toBeGreaterThan(4);
        expect(
          points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
        ).toBe(true);
        expect(
          (Math.min(...points.map((p) => p.x)) +
            Math.max(...points.map((p) => p.x))) /
            2,
        ).toBeCloseTo(400, 2);
        expect(
          (Math.min(...points.map((p) => p.y)) +
            Math.max(...points.map((p) => p.y))) /
            2,
        ).toBeCloseTo(300, 2);
      }
    }
  });

  it('retains geometry limits and avoids invalid paths', () => {
    const project = camera([0, 0]);
    for (const area of [0, NaN]) {
      expect(
        overlayPath(
          createCenteredOverlay(area, [0, 0], project).bounds,
          project,
          true,
        ),
      ).toBe('');
    }
    expect(createCenteredOverlay(toArea(1), [0, 90], project).approximate).toBe(
      true,
    );
    expect(
      overlayPath(
        [
          [0, 0],
          [1, 1],
        ],
        () => ({ x: Infinity, y: NaN }),
        true,
      ),
    ).toBe('');
    expect(
      pathPoints(
        overlayPath(
          [
            [0, 0],
            [1, 1],
          ],
          project,
          false,
        ),
      ),
    ).toHaveLength(4);
  });

  it('matches the globe preset at close-up zooms and projects the camera world at the date line', () => {
    let zoom = 3;
    const map = {
      getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
      getCenter: () => ({ lng: 181, lat: 60 }),
      unproject: () => ({ lng: 181, lat: 60 }),
      getZoom: () => zoom,
      project: vi.fn(([lng, lat]: [number, number]) =>
        zoom < 12
          ? camera([181, 60])([lng, lat])
          : {
              x: 400 + (lng - 181),
              y: 300 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
            },
      ),
    } as unknown as Map;
    expect(
      pathPoints(viewportOverlay(map, 100_000).path).length,
    ).toBeGreaterThan(4);
    zoom = 12;
    const closeUp = viewportOverlay(map, 100_000);
    expect(pathPoints(closeUp.path)).toHaveLength(4);
    for (const projected of [closeUp, viewportOverlay(map, toArea(1))]) {
      const points = pathPoints(projected.path);
      expect(projected.width).toBe(
        Math.max(...points.map((p) => p.x)) -
          Math.min(...points.map((p) => p.x)),
      );
      expect(projected.height).toBe(
        Math.max(...points.map((p) => p.y)) -
          Math.min(...points.map((p) => p.y)),
      );
    }
    expect(viewportOverlay(map, 0)).toMatchObject({
      path: '',
      width: 0,
      height: 0,
      bottomLeft: null,
    });
    expect(map.project).toHaveBeenCalledWith([181, 60]);
  });
});
