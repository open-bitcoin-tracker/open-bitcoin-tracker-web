import { describe, expect, it } from 'vitest';
import { earth } from '../../../i18n/earth';
import { ui } from '../../../i18n/ui';

const placeholders = (value: string) => [...value.matchAll(/\{\w+\}/g)].map(([key]) => key).sort();

describe('Earth translations', () => {
  it('covers every registered language with matching keys and placeholders', () => {
    expect(Object.keys(earth).sort()).toEqual(Object.keys(ui).sort());
    for (const copy of Object.values(earth)) {
      expect(Object.keys(copy).sort()).toEqual(Object.keys(earth.en).sort());
      for (const key of Object.keys(earth.en) as (keyof typeof earth.en)[]) {
        expect(copy[key].trim()).not.toBe('');
        expect(placeholders(copy[key]), key).toEqual(placeholders(earth.en[key]));
      }
    }
  });
});
