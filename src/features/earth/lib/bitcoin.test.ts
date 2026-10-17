import { describe, expect, it } from 'vitest';
import { toArea, LAND_KM2, MAX_BTC } from './bitcoin';

describe('fixed proportional model', () => {
  it('converts zero, one BTC and the full supply cap', () => {
    expect(toArea(0)).toBe(0);
    expect(toArea(1)).toBeCloseTo(7.09238095238, 10);
    expect(toArea(MAX_BTC)).toBe(LAND_KM2);
  });

  it.each([
    [0.001, 0.00709238095238],
    [1000, 7092.38095238],
  ])('calculates the area for the %s BTC preset', (btc, expectedKm2) => {
    expect(toArea(btc)).toBeCloseTo(expectedKm2, 8);
  });
});
