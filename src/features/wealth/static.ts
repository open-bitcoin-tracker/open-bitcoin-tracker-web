import rawSnapshot from './snapshot.json';
import rawSupply from '../supply/snapshot.json';
import { isValidSnapshot, type SupplySnapshot } from '../supply/model';
import { baseValues, broadMoneyUsd, circulatingSupply, estimateHeight, isValidWealthSnapshot, totalValue, type WealthSnapshot } from './model';

/** Build-time values: the reviewed fallback prices and the supply at the snapshot's reference block. */
export function staticWealth() {
  const snapshot = rawSnapshot as WealthSnapshot;
  const supplySnapshot = rawSupply as SupplySnapshot;
  if (!isValidWealthSnapshot(snapshot) || !isValidSnapshot(supplySnapshot)) throw new Error('Invalid wealth snapshot. Verify the sources before building.');
  const fiat = broadMoneyUsd(supplySnapshot, snapshot.fiat.usdRates);
  if (!Number.isFinite(fiat)) throw new Error('Broad money conversion failed. Check the exchange rates.');
  const supply = circulatingSupply(estimateHeight(snapshot.bitcoin, Date.parse(snapshot.bitcoin.referenceTime)));
  const base = baseValues(snapshot, fiat, snapshot.bitcoin.fallbackPrice, snapshot.gold.fallbackPrice, supply);
  return { snapshot, fiat, supply, base, total: totalValue(base) };
}
