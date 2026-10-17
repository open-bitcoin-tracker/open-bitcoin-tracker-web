import type { EarthCopy } from '../../i18n/earth';
import type { Lang } from '../../i18n/ui';
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

export default function App({ lang, copy }: { lang: Lang; copy: EarthCopy }) {
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
    lang,
    copy,
    onInteraction: clearPlace,
  });

  function choosePlace(location: Capital) {
    setPlace(location);
    map.goToLocation(location);
  }

  return (
    <div
      className="earth-feature app-shell"
      lang={lang}
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
              lang={lang}
              copy={copy}
              btc={btc}
              onChange={setBtc}
            />
            <InfoButton copy={copy} onAbout={() => setAboutOpen(true)} />
          </div>
          <section className="floating-search" aria-label={copy.comparison}>
            <CountrySelect lang={lang} copy={copy} selected={place} onSelect={choosePlace} />
          </section>
        </div>
        <EarthMap
          copy={copy}
          ready={map.ready}
          error={map.error ? copy[map.error] : null}
          containerRef={map.containerRef}
          overlayRef={map.overlayRef}
          onRetry={map.retry}
        />
      </div>
      {aboutOpen && <About lang={lang} copy={copy} onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
