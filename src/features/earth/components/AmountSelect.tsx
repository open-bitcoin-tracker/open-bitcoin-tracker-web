import { AMOUNT_PRESETS, type PresetAmount } from '../lib/bitcoin';
import DropdownSelect from './DropdownSelect';
import './AmountSelect.css';

const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
const options = AMOUNT_PRESETS.map((value) => ({
  value,
  label: format.format(Number(value)),
}));

interface AmountSelectProps {
  btc: PresetAmount;
  onChange: (btc: PresetAmount) => void;
}

export default function AmountSelect({ btc, onChange }: AmountSelectProps) {
  return (
    <section className="floating-amount" aria-label="Bitcoin area calculator">
      <div className="amount-control">
        <span className="bitcoin-symbol" aria-hidden="true">₿</span>
        <div className="amount-choice">
          <DropdownSelect
            value={btc}
            options={options}
            label="Bitcoin amount in BTC"
            onChange={onChange}
          />
        </div>
      </div>
    </section>
  );
}
