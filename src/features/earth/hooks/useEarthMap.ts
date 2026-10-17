import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Map, StyleSpecification } from 'maplibre-gl';
import mapStyle from '../map/style.json';
import type { Location } from '../lib/locations';
import { DEFAULT_CENTER } from '../map/geo';
import type { Theme } from '../lib/siteTheme';
import { followViewportCenter, viewportOverlay } from '../map/mapOverlay';
import type { Lang } from '../../../i18n/ui';
import type { EarthCopy } from '../../../i18n/earth';
import { localizeMapStyle } from '../map/mapLanguage';
import { applyMapTheme } from '../map/mapTheme';
import { renderOverlay } from '../map/renderOverlay';

const DEFAULT_ZOOM = 14;

interface EarthMapOptions {
  km2: number | null;
  theme: Theme;
  lang: Lang;
  copy: EarthCopy;
  onInteraction: () => void;
}

export function useEarthMap({
  km2,
  theme,
  lang,
  copy,
  onInteraction,
}: EarthMapOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGPathElement>(null);
  const mapRef = useRef<Map | null>(null);
  const loadedRef = useRef(false);
  const baseStyleRef = useRef<StyleSpecification | null>(null);
  const centerRef = useRef(DEFAULT_CENTER);
  const optionsRef = useRef({ km2, theme, onInteraction });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<'mapSlow' | 'mapError' | 'mapStartError' | null>(null);
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
    if (!map || !path || !baseStyleRef.current || !loadedRef.current) return;
    const projected = viewportOverlay(map, area);
    renderOverlay(path, projected);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: Map | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    let stopFollowing: (() => void) | undefined;
    let disposed = false;

    function cleanup() {
      loadedRef.current = false;
      overlayRef.current?.removeAttribute('d');
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
    async function initialize(container: HTMLDivElement) {
      try {
        const { AttributionControl, LngLat, Map } = await import('../map/engine');
        if (disposed) return;
        const instance = new Map({
          container,
          style: localizeMapStyle(mapStyle as StyleSpecification, lang),
          locale: {
            'Map.Title': copy.map,
            'AttributionControl.ToggleAttribution': copy.attribution,
            'AttributionControl.MapFeedback': copy.mapFeedback,
          },
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
          setError('mapSlow');
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
          loadedRef.current = true;
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
          setError('mapError');
        });
        instance.on('movestart', (event) => {
          if (event.originalEvent) optionsRef.current.onInteraction();
        });

        observer = new ResizeObserver(() => instance.resize());
        observer.observe(container);
      } catch {
        if (disposed) return;
        cleanup();
        setError('mapStartError');
      }
    }
    void initialize(container);
    return () => { disposed = true; cleanup(); };
  }, [retryCount, syncOverlay, lang, copy]);

  useLayoutEffect(() => {
    syncOverlay();
  }, [km2, ready, syncOverlay]);

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
    ready,
    error,
    goToLocation,
    retry,
  };
}
