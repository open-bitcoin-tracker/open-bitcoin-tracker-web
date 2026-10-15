export type MeasurementSystem = 'metric' | 'imperial';

// International foot and mile, rather than the retired US survey units.
const METRES_PER_FOOT = 0.3048;
const METRES_PER_MILE = 1609.344;
const SQUARE_METRES_PER_ACRE = 43_560 * METRES_PER_FOOT ** 2;
const SQUARE_METRES_PER_MILE = METRES_PER_MILE ** 2;

export function formatArea(
  km2: number,
  system: MeasurementSystem = 'metric',
): { number: string; unit: string } {
  const m2 = km2 * 1e6;
  if (system === 'imperial') {
    if (m2 > 0 && m2 / SQUARE_METRES_PER_ACRE < 1 - Number.EPSILON * 4)
      return { number: formatSmall(m2 / METRES_PER_FOOT ** 2), unit: 'ft²' };
    if (m2 > 0 && m2 / SQUARE_METRES_PER_MILE < 1 - Number.EPSILON * 4)
      return {
        number: formatMeasurement(m2 / SQUARE_METRES_PER_ACRE),
        unit: 'acres',
      };
    return { number: formatLarge(m2 / SQUARE_METRES_PER_MILE), unit: 'mi²' };
  }
  if (km2 > 0 && km2 < 0.01) return { number: formatSmall(m2), unit: 'm²' };
  if (km2 >= 0.01 && km2 < 1)
    return { number: formatMeasurement(km2 * 100), unit: 'ha' };
  return { number: formatLarge(km2), unit: 'km²' };
}

export function formatSide(
  km2: number,
  system: MeasurementSystem = 'metric',
): string {
  const metres = Math.sqrt(km2) * 1000;
  const largeUnitMetres = system === 'metric' ? 1000 : METRES_PER_MILE;
  const smallUnitMetres = system === 'metric' ? 1 : METRES_PER_FOOT;
  // Treat an exact unit boundary as equal despite square-root roundoff.
  return metres / largeUnitMetres < 1 - Number.EPSILON * 4
    ? `${formatMeasurement(metres / smallUnitMetres)} ${system === 'metric' ? 'm' : 'ft'}`
    : `${formatMeasurement(metres / largeUnitMetres)} ${system === 'metric' ? 'km' : 'mi'}`;
}

function formatMeasurement(value: number): string {
  // Round to nearest, retaining enough precision for sub-unit side lengths.
  return value.toLocaleString('en-GB', {
    maximumFractionDigits: value > 0 && value < 1 ? 3 : 2,
  });
}

function formatSmall(value: number): string {
  return value.toLocaleString('en-GB', {
    maximumFractionDigits: value < 1 ? 4 : value < 10 ? 3 : 2,
  });
}

function formatLarge(value: number): string {
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
