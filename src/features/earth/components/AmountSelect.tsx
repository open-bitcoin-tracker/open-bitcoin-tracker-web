import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { EarthCopy } from '../../../i18n/earth';
import { MAX_BTC, parseBitcoinAmount, exceedsBitcoinPrecision } from '../lib/bitcoin';
import './AmountSelect.css';

interface AmountSelectProps {
  lang: string;
  copy: EarthCopy;
  btc: string;
  onChange: (btc: string) => void;
}

function proposedValue(input: HTMLInputElement, inserted: string): string {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  return input.value.slice(0, start) + inserted + input.value.slice(end);
}

export default function AmountSelect({ lang, copy, btc, onChange }: AmountSelectProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const shakeRef = useRef<Animation | null>(null);
  const noticeTimeout = useRef<number | undefined>(undefined);
  const [pointerFocus, setPointerFocus] = useState(false);
  const [precisionRejected, setPrecisionRejected] = useState(false);
  const [noticeSequence, setNoticeSequence] = useState(0);
  const parsed = parseBitcoinAmount(btc);
  const invalid = btc.trim() !== '' && parsed === null;

  const rejectPrecision = useCallback(() => {
    setPrecisionRejected(true);
    setNoticeSequence((sequence) => sequence + 1);
    window.clearTimeout(noticeTimeout.current);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Animation end dismisses the notice; the timer also handles canceled animations.
    noticeTimeout.current = window.setTimeout(() => setPrecisionRejected(false), reducedMotion ? 3000 : 3400);
    shakeRef.current?.cancel();
    if (reducedMotion) return;
    shakeRef.current = inputRef.current?.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' }, { transform: 'translateX(-3px)' },
      { transform: 'translateX(3px)' }, { transform: 'translateX(0)' },
    ], { duration: 240, easing: 'ease-in-out' }) ?? null;
  }, []);

  useEffect(() => {
    const input = inputRef.current!;
    const beforeInput = (event: InputEvent) => {
      if (event.data === null || !event.inputType.startsWith('insert')) return;
      if (exceedsBitcoinPrecision(proposedValue(input, event.data))) {
        event.preventDefault();
        rejectPrecision();
      }
    };
    input.addEventListener('beforeinput', beforeInput);
    return () => {
      input.removeEventListener('beforeinput', beforeInput);
      shakeRef.current?.cancel();
      window.clearTimeout(noticeTimeout.current);
    };
  }, [rejectPrecision]);

  return (
    <section className="floating-amount" aria-label={copy.calculator}>
      <div className="amount-control">
        <span className="bitcoin-symbol" aria-hidden="true">₿</span>
        <input
          ref={inputRef}
          className="amount-input"
          data-pointer-focus={pointerFocus || undefined}
          onPointerDown={() => setPointerFocus(true)}
          onBlur={() => setPointerFocus(false)}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          aria-label={copy.amount}
          aria-invalid={invalid || undefined}
          aria-describedby={precisionRejected ? `${id}-precision` : invalid ? `${id}-error` : undefined}
          value={btc}
          onPaste={(event) => {
            if (exceedsBitcoinPrecision(proposedValue(event.currentTarget, event.clipboardData.getData('text')))) {
              event.preventDefault();
              rejectPrecision();
            }
          }}
          onChange={(event) => {
            const next = event.currentTarget.value;
            // Fallback for non-cancelable edits, autofill, or input methods without beforeinput data.
            if (exceedsBitcoinPrecision(next)) {
              event.currentTarget.value = btc;
              rejectPrecision();
              return;
            }
            setPrecisionRejected(false);
            window.clearTimeout(noticeTimeout.current);
            shakeRef.current?.cancel();
            onChange(next);
          }}
        />
        {precisionRejected && <span
          key={noticeSequence}
          id={`${id}-precision`}
          className="amount-precision"
          role="status"
          onAnimationEnd={(event) => {
            if (event.animationName !== 'amount-precision-notice') return;
            window.clearTimeout(noticeTimeout.current);
            setPrecisionRejected(false);
          }}
        >{copy.amountPrecision}</span>}
      </div>
      {invalid && <p id={`${id}-error`} className="amount-error" role="status">
        {copy.amountInvalid.replace('{max}', new Intl.NumberFormat(lang).format(MAX_BTC))}
      </p>}
    </section>
  );
}
