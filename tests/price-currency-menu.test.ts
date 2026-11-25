import test from 'node:test';
import assert from 'node:assert/strict';
import { placePriceCurrencyMenu } from '../src/lib/price-currency-menu.ts';

const base = {
  pickerLeft: 16, pickerTop: 16, priceRight: 716, codeLeft: 724, codeBottom: 80, triggerBottom: 220,
  menuWidth: 336, viewportWidth: 1440, viewportHeight: 900, gutter: 16, gap: 8, bottomRoom: 80, maxHeight: 480,
};

test('on wide screens the menu drops from the currency code into the space beside the price', () => {
  assert.deepEqual(placePriceCurrencyMenu(base), { left: 708, top: 72, maxHeight: 480 });
});

test('without room beside the price the menu opens below it, as close to the chevron as fits', () => {
  const placement = placePriceCurrencyMenu({ ...base, viewportWidth: 900 });
  assert.equal(placement.left, 900 - 16 - 336 - 16);
  assert.equal(placement.top, 220 + 8 - 16);
});

test('on phones the full-width menu stays at the start of the price', () => {
  const placement = placePriceCurrencyMenu({ ...base, priceRight: 330, codeLeft: 338, viewportWidth: 390, menuWidth: 358 });
  assert.equal(placement.left, 0);
  assert.equal(placement.top, 212);
});

test('the menu never runs into the chart controls at the bottom', () => {
  const placement = placePriceCurrencyMenu({ ...base, viewportWidth: 900, viewportHeight: 500 });
  assert.equal(placement.maxHeight, 500 - 228 - 80);
});
