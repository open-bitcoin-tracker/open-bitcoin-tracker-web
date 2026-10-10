import { useMemo, useState } from 'react';
import { convertAmount, parseAmount, toArea } from '../lib/bitcoin';
import type { AmountUnit } from '../lib/bitcoin';

export function useBitcoinAmount() {
  const [raw, setRaw] = useState('0.1');
  const [unit, setUnit] = useState<AmountUnit>('BTC');
  const parsed = useMemo(() => parseAmount(raw, unit), [raw, unit]);
  const km2 = parsed.value === null ? null : toArea(parsed.value);

  function chooseUnit(next: AmountUnit) {
    setRaw(convertAmount(raw, unit, next));
    setUnit(next);
  }

  return { raw, setRaw, unit, chooseUnit, km2, error: parsed.error };
}
