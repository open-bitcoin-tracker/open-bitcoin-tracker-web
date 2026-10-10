import { useCallback, useState } from 'react';
import About from './components/About';
import AmountInput from './components/AmountInput';
import AreaReadout from './components/AreaReadout';
import BrandPanel from './components/BrandPanel';
import EarthMap from './components/EarthMap';
import LocationSearch from './components/LocationSearch';
import MapControls from './components/MapControls';
import MeasurementSelect from './components/MeasurementSelect';
import MobileMenu from './components/MobileMenu';
import { useBitcoinAmount } from './hooks/useBitcoinAmount';
import { useEarthMap } from './hooks/useEarthMap';
import { useTheme } from './hooks/useTheme';
import { useMeasurements } from './hooks/useMeasurements';
import type { Location } from './lib/locations';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/global.css';
import './styles/app.css';

export default function App() {
  const amount = useBitcoinAmount();
  const { theme, setTheme } = useTheme();
  const { measurements, chooseMeasurements } = useMeasurements();
  const [place, setPlace] = useState('');
  const [aboutOpen, setAboutOpen] = useState(false);
  const clearPlace = useCallback(() => setPlace(''), []);
  const map = useEarthMap({
    km2: amount.km2,
    theme,
    measurements,
    onInteraction: clearPlace,
  });

  function choosePlace(location: Location) {
    setPlace(location.name);
    map.goToLocation(location);
  }

  return (
    <div className="earth-feature app-shell" lang="en" data-theme={theme}>
      <div className="earth-workspace">
        <div className="floating-panels">
          <BrandPanel onAbout={() => setAboutOpen(true)} />
          <AmountInput
            raw={amount.raw}
            unit={amount.unit}
            error={amount.error}
            onChange={amount.setRaw}
            onUnitChange={amount.chooseUnit}
          />
          <section className="floating-search" aria-label="Comparison location">
            <LocationSearch selectedName={place} onSelect={choosePlace} />
          </section>
        </div>
        <AreaReadout
          km2={amount.km2}
          measurements={measurements}
          readoutRef={map.readoutRef}
        />
        <MeasurementSelect value={measurements} onChange={chooseMeasurements} />
        <MapControls theme={theme} onThemeChange={setTheme} />
        <MobileMenu
          measurements={measurements}
          onMeasurementsChange={chooseMeasurements}
          theme={theme}
          onThemeChange={setTheme}
          onAbout={() => setAboutOpen(true)}
        />
        <EarthMap
          km2={amount.km2}
          ready={map.ready}
          error={map.error}
          containerRef={map.containerRef}
          overlayRef={map.overlayRef}
          onRetry={map.retry}
        />
      </div>
      {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
