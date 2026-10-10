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
        number: formatRounded(m2 / SQUARE_METRES_PER_ACRE),
        unit: 'acres',
      };
    return { number: formatLarge(m2 / SQUARE_METRES_PER_MILE), unit: 'mi²' };
  }
  if (km2 > 0 && km2 < 0.01) return { number: formatSmall(m2), unit: 'm²' };
  if (km2 >= 0.01 && km2 < 1)
    return { number: formatRounded(km2 * 100), unit: 'ha' };
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
    ? `${formatRounded(metres / smallUnitMetres)} ${system === 'metric' ? 'm' : 'ft'}`
    : `${formatRounded(metres / largeUnitMetres)} ${system === 'metric' ? 'km' : 'mi'}`;
}

function formatRounded(value: number): string {
  const scale = value > 0 && value < 1 ? 10 : 1;
  const scaled = value * scale;
  // Do not round an exact measurement up again because of conversion roundoff.
  const rounded = Math.ceil(scaled - Number.EPSILON * scaled * 4) / scale;
  const decimals = rounded > 0 && rounded < 1 ? 1 : 0;
  return rounded.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatSmall(value: number): string {
  return value.toLocaleString('en-GB', {
    maximumFractionDigits: value < 1 ? 4 : value < 10 ? 3 : 2,
  });
}

function formatLarge(value: number): string {
  return (Math.ceil(value * 10) / 10).toLocaleString('en-GB', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
