import { describe, expect, it } from 'vitest';
import turfArea from '@turf/area';
import { LAND_KM2, toArea } from '../lib/bitcoin';
import { createOverlay } from './geo';

describe('spherical geographic overlay', () => {
  for (const btc of [0.00000001, 0.001, 1, 10.6, 100, 10_000, 140_000]) {
    for (const lat of [0, 51.5072, -33.9, 75, 84]) {
      for (const lng of [0, 179.99999, -179.99999]) {
        it(`verifies ${btc} BTC at ${lng}, ${lat}`, () => {
          const target = toArea(btc);
          const overlay = createOverlay(target, [lng, lat]);
          if (!overlay.feature) {
            expect(overlay.approximate).toBe(true);
            return;
          }
          expect(
            Math.abs(turfArea(overlay.feature) / 1e6 - target) / target,
          ).toBeLessThan(0.0001);
          for (const polygon of overlay.feature.geometry.type === 'Polygon'
            ? [overlay.feature.geometry.coordinates]
            : overlay.feature.geometry.coordinates) {
            for (const coord of polygon[0]) {
              expect(coord[0]).toBeGreaterThanOrEqual(-180);
              expect(coord[0]).toBeLessThanOrEqual(180);
            }
          }
        });
      }
    }
  }
  it('splits date-line crossings and uses a compact fit bound', () => {
    const result = createOverlay(toArea(1), [179.999, 0]);
    expect(result.feature?.geometry.type).toBe('MultiPolygon');
    expect(result.bounds![1][0] - result.bounds![0][0]).toBeLessThan(1);
  });
  it('renders large areas up to the full supply without an arbitrary size cutoff', () => {
    for (const area of [1_000_001, 10_000_000, LAND_KM2]) {
      for (const lng of [0, 179.999, -179.999]) {
        const overlay = createOverlay(area, [lng, 0]);
        expect(overlay.feature).not.toBeNull();
        expect(overlay.approximate).toBe(false);
        expect(Math.abs(overlay.measuredKm2 / area - 1)).toBeLessThan(0.0001);
      }
    }
  });
  it('omits zero and shapes that cannot fit at the selected latitude', () => {
    expect(createOverlay(0, [0, 0]).feature).toBeNull();
    expect(createOverlay(LAND_KM2, [0, 51.5072]).approximate).toBe(true);
    expect(createOverlay(toArea(1), [0, 90]).approximate).toBe(true);
  });
});
