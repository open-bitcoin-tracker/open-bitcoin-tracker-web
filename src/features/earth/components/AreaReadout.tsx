import type { Ref } from 'react';
import { formatArea, formatSide } from '../lib/measurements';
import type { MeasurementSystem } from '../lib/measurements';
import './AreaReadout.css';

interface AreaReadoutProps {
  km2: number | null;
  measurements: MeasurementSystem;
  ready: boolean;
  readoutRef: Ref<HTMLElement>;
}

export default function AreaReadout({
  km2,
  measurements,
  ready,
  readoutRef,
}: AreaReadoutProps) {
  const readout = km2 === null ? null : formatArea(km2, measurements);
  const hasArea = km2 !== null && km2 > 0;
  const explanation =
    km2 === 0
      ? 'Zero Bitcoin means zero area. No overlay is drawn.'
      : 'Enter a valid amount to calculate the area.';

  return (
    <section
      ref={readoutRef}
      className="result"
      hidden={!ready || !hasArea}
      aria-label="Equivalent land area"
    >
      <div className="result-summary">
        <div
          className={`area-value ${(readout?.number.length ?? 0) > 8 ? 'long-readout' : ''}`}
          data-unit={readout?.unit}
          aria-live="polite"
          aria-atomic="true"
        >
          {readout?.number ?? '—'}
          <span>
            {readout?.unit ?? (measurements === 'metric' ? 'km²' : 'mi²')}
          </span>
        </div>
      </div>
      <p className="side-length" aria-live="polite">
        {hasArea ? (
          <>
            <strong>{formatSide(km2, measurements)}</strong> per side
          </>
        ) : (
          explanation
        )}
      </p>
    </section>
  );
}
