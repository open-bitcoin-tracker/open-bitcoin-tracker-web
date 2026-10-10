import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseLocations } from './locations';

const berlin = {
  geometry: { type: 'Point', coordinates: [13.4, 52.5] },
  properties: {
    name: 'Berlin',
    city: 'Berlin',
    state: 'Berlin',
    country: 'Germany',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('location results', () => {
  it('keeps longitude first, distinguishes the country, and removes duplicate labels/results', () => {
    expect(parseLocations({ features: [berlin, berlin] })).toEqual([
      { name: 'Berlin, Germany', center: [13.4, 52.5] },
    ]);
  });
  it('labels address results without a name', () => {
    expect(
      parseLocations({
        features: [
          {
            ...berlin,
            properties: {
              housenumber: '10',
              street: 'Downing Street',
              city: 'London',
              country: 'United Kingdom',
            },
          },
        ],
      })[0].name,
    ).toBe('10 Downing Street, London, United Kingdom');
  });
  it('ignores malformed features and coordinates instead of moving the map to an invalid point', () => {
    expect(
      parseLocations({
        features: [
          null,
          {},
          { ...berlin, geometry: { type: 'Point', coordinates: [181, 52] } },
          { ...berlin, geometry: { type: 'Point', coordinates: [13, NaN] } },
          { ...berlin, geometry: { type: 'Point', coordinates: ['13', '52'] } },
          { ...berlin, properties: {} },
        ],
      }),
    ).toEqual([]);
  });
  it('preserves polar locations as valid search results', () => {
    expect(
      parseLocations({
        features: [
          { ...berlin, geometry: { type: 'Point', coordinates: [0, 89] } },
        ],
      })[0].center,
    ).toEqual([0, 89]);
  });
  it('rejects a broken response instead of reporting no matches', () => {
    expect(() => parseLocations({ error: 'unavailable' })).toThrow();
    expect(parseLocations({ features: [] })).toEqual([]);
  });
});

describe('location lookup', () => {
  it('encodes the query, passes cancellation, and reuses cached results', async () => {
    vi.resetModules();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [berlin] }),
    });
    vi.stubGlobal('fetch', fetch);
    const { searchLocations } = await import('./locations');
    const signal = new AbortController().signal;
    const results = await searchLocations(' Berlin & Germany ', signal);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('q')).toBe(
      'Berlin & Germany',
    );
    expect(fetch.mock.calls[0][1].signal).toBe(signal);
    expect(await searchLocations('berlin & germany', signal)).toEqual(results);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not send empty or one-character searches', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { searchLocations } = await import('./locations');
    expect(await searchLocations('  ', new AbortController().signal)).toEqual(
      [],
    );
    expect(await searchLocations('a', new AbortController().signal)).toEqual(
      [],
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('allows retrying failed requests without caching the failure', async () => {
    vi.resetModules();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [] }),
      });
    vi.stubGlobal('fetch', fetch);
    const { searchLocations } = await import('./locations');
    const signal = new AbortController().signal;
    await expect(searchLocations('Unknown place', signal)).rejects.toThrow();
    expect(await searchLocations('Unknown place', signal)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
