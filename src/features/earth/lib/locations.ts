export interface Location {
  name: string;
  center: [number, number];
}

// Photon-compatible endpoint; can be replaced with a hosted/private instance.
const endpoint =
  import.meta.env.PUBLIC_EARTH_GEOCODER_URL || 'https://photon.komoot.io/api/';
export const locationSearchProvider = import.meta.env.PUBLIC_EARTH_GEOCODER_URL
  ? 'the configured search service'
  : 'Photon';
const cache = new Map<string, Location[]>();

export function parseLocations(data: unknown): Location[] {
  if (
    !data ||
    typeof data !== 'object' ||
    !('features' in data) ||
    !Array.isArray(data.features)
  ) {
    throw new Error('Invalid search response');
  }
  const results: Location[] = [];
  const seen = new Set<string>();
  for (const feature of data.features) {
    const coordinates = feature?.geometry?.coordinates;
    const properties = feature?.properties;
    if (
      feature?.geometry?.type !== 'Point' ||
      !Array.isArray(coordinates) ||
      !properties
    )
      continue;
    const [lng, lat] = coordinates;
    if (
      typeof lng !== 'number' ||
      typeof lat !== 'number' ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      Math.abs(lng) > 180 ||
      Math.abs(lat) > 90
    )
      continue;
    const street = [properties.housenumber, properties.street]
      .filter((value) => typeof value === 'string' && value.trim())
      .join(' ');
    const parts = [
      properties.name || street,
      properties.city,
      properties.state,
      properties.country,
    ];
    const name = [
      ...new Set(
        parts.filter(
          (value): value is string =>
            typeof value === 'string' && !!value.trim(),
        ),
      ),
    ].join(', ');
    const key = `${name}:${lng}:${lat}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    results.push({ name, center: [lng, lat] });
  }
  return results.slice(0, 5);
}

export async function searchLocations(
  query: string,
  signal: AbortSignal,
): Promise<Location[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const key = trimmed.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const params = new URLSearchParams({ q: trimmed, limit: '5', lang: 'en' });
  const response = await fetch(`${endpoint}?${params}`, { signal });
  if (!response.ok) throw new Error('Location search unavailable');
  const locations = parseLocations(await response.json());
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, locations);
  return locations;
}
