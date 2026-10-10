import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { Map, StyleSpecification } from 'maplibre-gl';
import style from './style.json';
import { applyMapTheme, createMapTheme } from './mapTheme';

const base = style as unknown as StyleSpecification;

describe('map appearance', () => {
  it('produces a valid dark palette while preserving streets, flat buildings and all map data', () => {
    const dark = createMapTheme(base, 'dark');
    expect(validateStyleMin(dark)).toEqual([]);
    expect(dark.sources).toEqual(base.sources);
    expect(dark.glyphs).toEqual(base.glyphs);
    const geometry = (s: StyleSpecification) =>
      s.layers.map(({ paint: _paint, ...layer }) => layer);
    expect(geometry(dark)).toEqual(geometry(base));
    expect(dark.layers.find((layer) => layer.id === 'building')?.type).toBe(
      'fill',
    );
    expect(
      dark.layers.find((layer) => layer.id === 'road_minor'),
    ).toBeDefined();
    expect(dark.layers.some((layer) => layer.type === 'fill-extrusion')).toBe(
      false,
    );
    expect(
      dark.layers.find((layer) => layer.id === 'water')?.paint,
    ).not.toEqual(base.layers.find((layer) => layer.id === 'water')?.paint);
  });

  it('restores the exact original palette after repeated mode changes, including zoom expressions and default properties', () => {
    const original = structuredClone(base);
    const current = structuredClone(base);
    const map = {
      setPaintProperty(id: string, key: string, value: unknown) {
        const layer = current.layers.find((layer) => layer.id === id)!;
        const paint = layer.paint as Record<string, unknown>;
        if (value === undefined) delete paint[key];
        else paint[key] = value;
      },
    } as unknown as Map;
    for (let i = 0; i < 3; i++) {
      applyMapTheme(map, base, 'dark');
      expect(validateStyleMin(current)).toEqual([]);
      expect(current).toEqual(createMapTheme(base, 'dark'));
      applyMapTheme(map, base, 'light');
      expect(current).toEqual(original);
    }
    expect(base).toEqual(original);
  });
});
