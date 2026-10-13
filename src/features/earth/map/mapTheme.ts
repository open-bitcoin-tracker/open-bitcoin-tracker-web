import type { LayerSpecification, Map, StyleSpecification } from 'maplibre-gl';
import type { Theme } from '../lib/siteTheme';

type PaintProperty = Parameters<Map['setPaintProperty']>[1];
type PaintValue = Parameters<Map['setPaintProperty']>[2];

function darkPaint(
  layer: LayerSpecification,
): Partial<Record<PaintProperty, PaintValue>> {
  if (layer.type === 'background') return { 'background-color': '#151a21' };
  // Keep the broad relief at world scale, with subdued colours matching the dark map.
  if (layer.type === 'raster')
    return { 'raster-brightness-max': 0.25, 'raster-saturation': -0.8 };
  const source = 'source-layer' in layer ? layer['source-layer'] : undefined;
  if (layer.type === 'symbol')
    return {
      'text-color':
        source === 'water_name' || source === 'waterway'
          ? '#8eb9d2'
          : source === 'transportation_name'
            ? '#c0cad5'
            : layer.id === 'label_other'
              ? '#a8b5c4'
              : '#e0e6ec',
      'text-halo-color': '#151a21',
    };
  if (layer.type === 'fill') {
    const colour =
      source === 'water'
        ? '#1b354a'
        : source === 'building'
          ? '#35404e'
          : source === 'park'
            ? '#293f32'
            : source === 'landuse'
              ? '#222a34'
              : layer.id === 'landcover_ice'
                ? '#647784'
                : layer.id === 'landcover_sand'
                  ? '#494331'
                  : '#304534';
    return {
      'fill-color': colour,
      ...('fill-outline-color' in (layer.paint ?? {})
        ? {
            'fill-outline-color': source === 'building' ? '#465364' : '#385040',
          }
        : {}),
    };
  }
  if (layer.type === 'line') {
    const colour =
      source === 'waterway'
        ? '#3d6480'
        : source === 'boundary'
          ? '#657284'
          : layer.id.endsWith('_casing')
            ? '#222a34'
            : layer.id.includes('motorway')
              ? '#748395'
              : layer.id.includes('trunk_primary')
                ? '#748395'
                : layer.id.includes('secondary_tertiary')
                  ? '#74808f'
                  : '#586575';
    return { 'line-color': colour };
  }
  return {};
}

export function createMapTheme(
  base: StyleSpecification,
  theme: Theme,
): StyleSpecification {
  if (theme === 'light') return base;
  return {
    ...base,
    layers: base.layers.map(
      (layer) =>
        ({
          ...layer,
          paint: { ...layer.paint, ...darkPaint(layer) },
        }) as LayerSpecification,
    ),
  };
}

export function applyMapTheme(
  map: Map,
  base: StyleSpecification,
  theme: Theme,
) {
  const dark = createMapTheme(base, 'dark');
  // Paint changes retain the camera, sources and cached tiles. Reset added properties in light mode.
  for (let i = 0; i < base.layers.length; i++) {
    const layer = base.layers[i];
    const paint = (theme === 'dark' ? dark.layers[i].paint : layer.paint) as
      Partial<Record<PaintProperty, PaintValue>> | undefined;
    for (const property of Object.keys(darkPaint(layer))) {
      const name = property as PaintProperty;
      map.setPaintProperty(layer.id, name, paint?.[name]);
    }
  }
}
