import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// Loaded after the calculator mounts; the map's engine, worker and styles do
// not block the form, search and measurement controls from becoming usable.
setWorkerUrl(workerUrl);
export { AttributionControl, LngLat, Map } from 'maplibre-gl';
