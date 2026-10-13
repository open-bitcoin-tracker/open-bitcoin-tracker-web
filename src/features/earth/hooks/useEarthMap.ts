import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AttributionControl, LngLat, Map, setWorkerUrl } from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import mapStyle from '../map/style.json';
import type { Location } from '../lib/locations';
import type { Theme } from '../lib/siteTheme';
import type { MeasurementSystem } from '../lib/measurements';
import { DEFAULT_CENTER } from '../map/geo';
import { followViewportCenter, viewportOverlay } from '../map/mapOverlay';
import { applyMapTheme } from '../map/mapTheme';
import { renderOverlay } from '../map/renderOverlay';

setWorkerUrl(workerUrl);

const DEFAULT_ZOOM = 14;

interface EarthMapOptions {
  km2: number | null;
  theme: Theme;
  measurements: MeasurementSystem;
  onInteraction: () => void;
}

export function useEarthMap({
  km2,
  theme,
  measurements,
  onInteraction,
}: EarthMapOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGPathElement>(null);
  const readoutRef = useRef<HTMLElement>(null);
  const mapRef = useRef<Map | null>(null);
  const baseStyleRef = useRef<StyleSpecification | null>(null);
  const centerRef = useRef(DEFAULT_CENTER);
  const optionsRef = useRef({ km2, theme, onInteraction });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Map callbacks read the latest committed settings without recreating the map.
  // Camera movement stays in a ref so it does not rerender the form controls.
  useLayoutEffect(() => {
    optionsRef.current = { km2, theme, onInteraction };
  }, [km2, theme, onInteraction]);

  const syncOverlay = useCallback(() => {
    const map = mapRef.current;
    const path = overlayRef.current;
    const area = optionsRef.current.km2 ?? 0;
    if (!map || !path || !baseStyleRef.current) return;
    const projected = viewportOverlay(map, area);
    renderOverlay(path, readoutRef.current, projected);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: Map | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    let stopFollowing: (() => void) | undefined;

    function cleanup() {
      clearTimeout(timer);
      observer?.disconnect();
      stopFollowing?.();
      map?.remove();
      observer = undefined;
      stopFollowing = undefined;
      map = undefined;
      mapRef.current = null;
      baseStyleRef.current = null;
    }

    baseStyleRef.current = null;
    setReady(false);
    setError(null);
    try {
      const instance = new Map({
        container,
        style: mapStyle as StyleSpecification,
        center: centerRef.current,
        zoom: DEFAULT_ZOOM,
        maxZoom: 22,
        minZoom: 0,
        // Bound the camera center rather than the viewport to preserve the
        // selected location as the globe flattens at close-up zooms.
        transformConstrain: (point, zoom) => ({
          center: new LngLat(point.lng, Math.max(-85, Math.min(85, point.lat))),
          zoom: Math.max(0, Math.min(22, zoom)),
        }),
        attributionControl: false,
        renderWorldCopies: true,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map = instance;
      mapRef.current = instance;
      instance.touchZoomRotate.disableRotation();
      instance.keyboard.disableRotation();
      instance.addControl(
        new AttributionControl({
          compact: false,
        }),
        'bottom-right',
      );

      timer = setTimeout(() => {
        setError(
          'The map is taking longer than expected. Check your connection and try again. Your area calculation still works.',
        );
      }, 20_000);

      instance.on('style.load', () => {
        const base = instance.getStyle();
        baseStyleRef.current = base;
        applyMapTheme(instance, base, optionsRef.current.theme);
        // MapLibre's globe preset uses a local flat projection for close-ups.
        instance.setProjection({ type: 'globe' });
      });
      instance.on('load', () => {
        clearTimeout(timer);
        setReady(true);
        setError(null);
        syncOverlay();
        stopFollowing = followViewportCenter(instance, (center) => {
          centerRef.current = center;
        });
        // Use the transform that drew this map frame, including projection transitions.
        instance.on('render', syncOverlay);
      });
      instance.on('error', () => {
        setError(
          'Some map data could not load. Check your connection, then retry. Your area calculation still works.',
        );
      });
      instance.on('movestart', (event) => {
        if (event.originalEvent) optionsRef.current.onInteraction();
      });

      observer = new ResizeObserver(() => instance.resize());
      observer.observe(container);
    } catch {
      cleanup();
      setError(
        'The map could not start. Your browser needs WebGL enabled. Try another browser; your area calculation still works.',
      );
    }
    return cleanup;
  }, [retryCount, syncOverlay]);

  useEffect(() => {
    syncOverlay();
  }, [km2, measurements, ready, syncOverlay]);

  useEffect(() => {
    if (mapRef.current && baseStyleRef.current) {
      applyMapTheme(mapRef.current, baseStyleRef.current, theme);
    }
  }, [theme]);

  const goToLocation = useCallback((location: Location) => {
    const map = mapRef.current;
    if (map) {
      map.flyTo({
        center: location.center,
        zoom: Math.max(map.getZoom(), 12),
        duration: 850,
      });
    } else {
      centerRef.current = location.center;
    }
  }, []);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  return {
    containerRef,
    overlayRef,
    readoutRef,
    ready,
    error,
    goToLocation,
    retry,
  };
}
