import { useCallback, useState } from 'react';
import About from './components/About';
import AmountSelect from './components/AmountSelect';
import InfoButton from './components/InfoButton';
import EarthMap from './components/EarthMap';
import CountrySelect from './components/CountrySelect';
import { toArea, type PresetAmount } from './lib/bitcoin';
import { useEarthMap } from './hooks/useEarthMap';
import { useTheme } from './hooks/useTheme';
import type { Capital } from './lib/locations';
import './styles/global.css';
import './styles/app.css';

export default function App() {
  const [btc, setBtc] = useState<PresetAmount>('0.1');
  const km2 = toArea(Number(btc));
  const theme = useTheme();
  const [inputMode, setInputMode] = useState<'keyboard' | 'pointer'>('keyboard');
  const [place, setPlace] = useState<Capital | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const clearPlace = useCallback(() => setPlace(null), []);
  const map = useEarthMap({
    km2,
    theme,
    onInteraction: clearPlace,
  });

  function choosePlace(location: Capital) {
    setPlace(location);
    map.goToLocation(location);
  }

  return (
    <div
      className="earth-feature app-shell"
      lang="en"
      data-theme={theme}
      data-input-mode={inputMode}
      onPointerDownCapture={() => setInputMode('pointer')}
      onKeyDownCapture={() => setInputMode('keyboard')}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setInputMode('keyboard');
      }}
    >
      <div className="earth-workspace">
        <div className="floating-panels">
          <div className="amount-row">
            <AmountSelect
              btc={btc}
              onChange={setBtc}
            />
            <InfoButton onAbout={() => setAboutOpen(true)} />
          </div>
          <section className="floating-search" aria-label="Comparison location">
            <CountrySelect selected={place} onSelect={choosePlace} />
          </section>
        </div>
        <EarthMap
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
