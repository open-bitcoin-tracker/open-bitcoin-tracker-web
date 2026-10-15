import { useCallback, useState } from 'react';
import About from './components/About';
import AmountInput from './components/AmountInput';
import AreaReadout from './components/AreaReadout';
import InfoButton from './components/InfoButton';
import EarthMap from './components/EarthMap';
import LocationSearch from './components/LocationSearch';
import MeasurementSelect from './components/MeasurementSelect';
import { useBitcoinAmount } from './hooks/useBitcoinAmount';
import { useEarthMap } from './hooks/useEarthMap';
import { useTheme } from './hooks/useTheme';
import { useMeasurements } from './hooks/useMeasurements';
import type { Location } from './lib/locations';
import './styles/global.css';
import './styles/app.css';

export default function App() {
  const amount = useBitcoinAmount();
  const theme = useTheme();
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
          <div className="amount-row">
            <AmountInput
              raw={amount.raw}
              unit={amount.unit}
              error={amount.error}
              onChange={amount.setRaw}
              onUnitChange={amount.chooseUnit}
            />
            <InfoButton onAbout={() => setAboutOpen(true)} />
          </div>
          <section className="floating-search" aria-label="Comparison location">
            <LocationSearch selectedName={place} onSelect={choosePlace} />
          </section>
        </div>
        <AreaReadout
          km2={amount.km2}
          measurements={measurements}
          ready={map.ready}
          readoutRef={map.readoutRef}
        />
        <MeasurementSelect value={measurements} onChange={chooseMeasurements} />
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
