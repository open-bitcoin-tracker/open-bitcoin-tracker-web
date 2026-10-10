import type { AmountUnit } from '../lib/bitcoin';
import DropdownSelect from './DropdownSelect';

const options = [
  { value: 'BTC', label: 'BTC' },
  { value: 'sats', label: 'sats' },
] as const;

interface UnitSelectProps {
  value: AmountUnit;
  onChange: (unit: AmountUnit) => void;
}

export default function UnitSelect({ value, onChange }: UnitSelectProps) {
  return (
    <DropdownSelect
      value={value}
      options={options}
      label="Unit of account"
      onChange={onChange}
    />
  );
}
