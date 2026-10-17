import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import { earth } from '../../../i18n/earth';
import style from './style.json';
import { localizeMapStyle } from './mapLanguage';
import { createMapTheme } from './mapTheme';

const base = style as unknown as StyleSpecification;

describe('localized map names', () => {
  it('creates valid labels in every locale and theme without changing sources or the base style', () => {
    const original = structuredClone(base);
    for (const lang of Object.keys(earth)) {
      const localized = localizeMapStyle(base, lang);
      expect(localized.sources).toEqual(base.sources);
      for (const theme of ['light', 'dark'] as const) {
        expect(validateStyleMin(createMapTheme(localized, theme))).toEqual([]);
      }
      const label = localized.layers.find((layer) => layer.id === 'label_city');
      expect(label?.layout).toHaveProperty('text-field', [
        'coalesce', ['get', `name:${lang.split('-')[0]}`],
        ['get', `name_${lang.split('-')[0]}`], ['get', 'name'],
      ]);
    }
    expect(base).toEqual(original);
  });

  it('preserves non-name labels such as highway route references', () => {
    const localized = localizeMapStyle(base, 'ja');
    for (let index = 0; index < base.layers.length; index++) {
      const layer = base.layers[index];
      if (layer.type !== 'symbol' || !JSON.stringify(layer.layout?.['text-field']).includes('name')) {
        expect(localized.layers[index]).toEqual(layer);
      }
    }
  });
});
