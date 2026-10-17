import type { EarthCopy } from '../../../i18n/earth';
import type { Ref } from 'react';
import { Info } from 'lucide-react';
import './EarthMap.css';

interface EarthMapProps {
  copy: EarthCopy;
  ready: boolean;
  error: string | null;
  containerRef: Ref<HTMLDivElement>;
  overlayRef: Ref<SVGPathElement>;
  onRetry: () => void;
}

export default function EarthMap({
  copy,
  ready,
  error,
  containerRef,
  overlayRef,
  onRetry,
}: EarthMapProps) {
  return (
    <section className="map-section" aria-label={copy.map}>
      <div ref={containerRef} className="map-container" />
      <svg className="bitcoin-overlay" aria-hidden="true">
        <path ref={overlayRef} />
      </svg>
      <div
        className={`map-loading${ready || error ? ' map-loading-hidden' : ''}`}
        role={!ready && !error ? 'status' : undefined}
        aria-label={!ready && !error ? copy.loadingMap : undefined}
        aria-hidden={ready || !!error}
      />
      {error && (
        <div className="map-error" role="alert">
          <Info size={19} />
          <p>{error}</p>
          <button onClick={onRetry}>{copy.retryMap}</button>
        </div>
      )}
    </section>
  );
}
