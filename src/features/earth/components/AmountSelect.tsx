import type { EarthCopy } from '../../../i18n/earth';
import { AMOUNT_PRESETS, type PresetAmount } from '../lib/bitcoin';
import DropdownSelect from './DropdownSelect';
import './AmountSelect.css';

interface AmountSelectProps {
  lang: string;
  copy: EarthCopy;
  btc: PresetAmount;
  onChange: (btc: PresetAmount) => void;
}

export default function AmountSelect({ lang, copy, btc, onChange }: AmountSelectProps) {
  const format = new Intl.NumberFormat(lang, { maximumFractionDigits: 3 });
  const options = AMOUNT_PRESETS.map((value) => ({ value, label: format.format(Number(value)) }));
  return (
    <section className="floating-amount" aria-label={copy.calculator}>
      <div className="amount-control">
        <span className="bitcoin-symbol" aria-hidden="true">₿</span>
        <div className="amount-choice">
          <DropdownSelect
            value={btc}
            options={options}
            label={copy.amount}
            onChange={onChange}
          />
        </div>
      </div>
    </section>
  );
}
