import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';

// OpenMapTiles names use name:xx. Some tiles also expose the older name_xx
// fields; fall back to the place's local name when neither is available.
export function localizeMapStyle(base: StyleSpecification, lang: string): StyleSpecification {
  const code = lang.split('-')[0];
  const text: ExpressionSpecification = [
    'coalesce', ['get', `name:${code}`], ['get', `name_${code}`], ['get', 'name'],
  ];
  return {
    ...base,
    layers: base.layers.map((layer) => {
      if (layer.type !== 'symbol' || !layer.layout?.['text-field']) return layer;
      // Road shields use route refs, not translated place names.
      if (!JSON.stringify(layer.layout['text-field']).includes('name')) return layer;
      return { ...layer, layout: { ...layer.layout, 'text-field': text } };
    }),
  };
}
