import type { MeasurementSystem } from '../lib/measurements';
import DropdownSelect from './DropdownSelect';
import './MeasurementSelect.css';

const options = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Feet & miles' },
] as const;

interface MeasurementSelectProps {
  value: MeasurementSystem;
  onChange: (system: MeasurementSystem) => void;
}

export default function MeasurementSelect({
  value,
  onChange,
}: MeasurementSelectProps) {
  return (
    <div className="measurement-panel">
      <DropdownSelect
        value={value}
        options={options}
        label="Measurements"
        onChange={onChange}
      />
    </div>
  );
}
