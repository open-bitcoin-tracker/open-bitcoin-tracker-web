import type { Ref } from 'react';
import { Info } from 'lucide-react';
import './EarthMap.css';

interface EarthMapProps {
  km2: number | null;
  ready: boolean;
  error: string | null;
  containerRef: Ref<HTMLDivElement>;
  overlayRef: Ref<SVGPathElement>;
  onRetry: () => void;
}

export default function EarthMap({
  km2,
  ready,
  error,
  containerRef,
  overlayRef,
  onRetry,
}: EarthMapProps) {
  return (
    <section className="map-section" aria-label="Interactive Earth map">
      <div ref={containerRef} className="map-container" />
      <svg className="bitcoin-overlay" aria-hidden="true">
        <path ref={overlayRef} />
      </svg>
      {!ready && !error && (
        <div className="map-loading" role="status">
          <span>Loading map...</span>
        </div>
      )}
      {error && (
        <div className="map-error" role="alert">
          <Info size={19} />
          <p>{error}</p>
          <button onClick={onRetry}>Retry map</button>
        </div>
      )}
      {ready && km2 !== null && km2 > 0 && km2 < 0.00001 && (
        <div className="tiny-note">
          Only the outlined fill represents area. Scroll or pinch to zoom in.
        </div>
      )}
    </section>
  );
}
