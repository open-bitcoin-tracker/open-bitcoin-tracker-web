import type { AmountUnit } from '../lib/bitcoin';
import {
  amountCaretPosition,
  formatAmountInput,
  limitAmountInput,
} from '../lib/amountInput';
import UnitSelect from './UnitSelect';
import './AmountInput.css';

interface AmountInputProps {
  raw: string;
  unit: AmountUnit;
  error: string | null;
  onChange: (raw: string) => void;
  onUnitChange: (unit: AmountUnit) => void;
}

export default function AmountInput({
  raw,
  unit,
  error,
  onChange,
  onUnitChange,
}: AmountInputProps) {
  const displayedAmount = formatAmountInput(raw);

  return (
    <section className="floating-amount" aria-label="Bitcoin area calculator">
      <div
        className={`amount-input ${error ? 'invalid' : ''} ${displayedAmount.length > 10 ? 'long-amount' : ''}`}
      >
        <span className="bitcoin-symbol" aria-hidden="true">
          ₿
        </span>
        <input
          id="btc"
          aria-label={unit === 'BTC' ? 'Bitcoin amount' : 'Amount in sats'}
          type="text"
          inputMode={unit === 'BTC' ? 'decimal' : 'numeric'}
          enterKeyHint="done"
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          value={displayedAmount}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          onChange={(event) => {
            const input = event.currentTarget;
            const text = input.value;
            const start = text
              .slice(0, input.selectionStart ?? text.length)
              .replace(/,/g, '').length;
            const end = text
              .slice(0, input.selectionEnd ?? text.length)
              .replace(/,/g, '').length;
            const nextRaw = limitAmountInput(text.replace(/,/g, ''), unit);
            const formatted = formatAmountInput(nextRaw);
            let selectionStart = amountCaretPosition(formatted, start);
            let selectionEnd = amountCaretPosition(formatted, end);

            // Move past a restored separator so Delete can reach the next digit.
            if (
              (event.nativeEvent as InputEvent).inputType ===
              'deleteContentForward'
            ) {
              if (formatted[selectionStart] === ',') selectionStart += 1;
              if (formatted[selectionEnd] === ',') selectionEnd += 1;
            }

            input.value = formatted;
            input.setSelectionRange(selectionStart, selectionEnd);
            onChange(nextRaw);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? 'amount-help' : undefined}
        />
        <UnitSelect value={unit} onChange={onUnitChange} />
      </div>
      {error && (
        <div id="amount-help" className="input-help error-text">
          {error}
        </div>
      )}
    </section>
  );
}
