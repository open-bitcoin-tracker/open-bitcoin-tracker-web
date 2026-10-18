import type { EarthCopy } from '../../../i18n/earth';
import { LAND_KM2, MAX_BTC, toArea } from '../lib/bitcoin';
import { createGuideDrawer } from '../../../lib/guide-drawer';
import '../../../styles/guide-drawer.css';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import EarthIntro from './EarthIntro';
import './About.css';


const sectionIds = ['calculation', 'privacy', 'sources'] as const;
type GuideSection = (typeof sectionIds)[number];
const repositoryUrl = 'https://github.com/open-bitcoin-tracker/open-bitcoin-tracker-web';

function ModelDetails({ section, copy, lang }: { section: GuideSection; copy: EarthCopy; lang: string }) {
  const number = new Intl.NumberFormat(lang);
  const area = number.format(LAND_KM2);
  switch (section) {
    case 'calculation':
      return (
        <div className="detail-content">
          <div className="model-assumptions">
            <div><span>{copy.maxSupply}</span><strong>{number.format(MAX_BTC)} BTC</strong></div>
            <div><span>{copy.landArea}</span><strong>{area} km²</strong></div>
          </div>
          <code>{copy.area} = (BTC ÷ {number.format(MAX_BTC)}) × {area} km²</code>
          <p>{copy.calculationScale
            .replace('{area}', new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(toArea(1)))
            .replace('{side}', new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(Math.sqrt(toArea(1))))}</p>
          <p>{copy.calculationNote}</p>
        </div>
      );
    case 'privacy': {
      const [before, after] = copy.privacyMap.split('{provider}');
      return (
        <div className="detail-content">
          <p>{copy.privacyLocal}</p>
          <p>{before}<a href="https://openfreemap.org/privacy/" target="_blank" rel="noreferrer">OpenFreeMap</a>{after}</p>
          <p><a href={repositoryUrl} target="_blank" rel="noreferrer">{copy.repositorySource}</a></p>
        </div>
      );
    }
    case 'sources':
      return (
        <div className="detail-content model-sources">
          <a href={repositoryUrl} target="_blank" rel="noreferrer">
            {copy.repositorySource} <ExternalLink size={14} />
          </a>
          <a
            href="https://bitcoin.org/en/halving"
            target="_blank"
            rel="noreferrer"
          >
            {copy.supplySource} <ExternalLink size={14} />
          </a>
          <a
            href="https://www.cia.gov/the-world-factbook/static/6c4d9b9a41b27707b6720720df7161d6/Physical_World.pdf"
            target="_blank"
            rel="noreferrer"
          >
            {copy.landSource} <ExternalLink size={14} />
          </a>
          <p>
            {copy.landSourceNote.replace('{area}', area)}
          </p>
          <a
            href="https://openfreemap.org/quick_start/"
            target="_blank"
            rel="noreferrer"
          >
            {copy.mapSource} <ExternalLink size={14} />
          </a>
          <a href="https://github.com/mledoze/countries" target="_blank" rel="noreferrer">
            {copy.namesSource} <ExternalLink size={14} />
          </a>
          <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">
            {copy.coordinatesSource} <ExternalLink size={14} />
          </a>
          <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
            {copy.extraCoordinatesSource} <ExternalLink size={14} />
          </a>
        </div>
      );
  }
}

interface AboutProps {
  copy: EarthCopy;
  lang: string;
  onClose: () => void;
}

export default function About({ copy, lang, onClose }: AboutProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailContentRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<GuideSection>('calculation');
  const activeTitle = copy[section];
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const triggers = [...dialog.querySelectorAll<HTMLButtonElement>('.guide-section-trigger')];
    const drawer = createGuideDrawer({
      dialog,
      overview: dialog.querySelector<HTMLElement>('.guide-shell')!,
      detail: dialog.querySelector<HTMLElement>('.guide-detail-panel')!,
      heading: headingRef.current,
      detailHeading: detailHeadingRef.current!,
      detailBody: detailContentRef.current!,
      back: dialog.querySelector<HTMLButtonElement>('.guide-back'),
      closeButtons: [...dialog.querySelectorAll<HTMLButtonElement>('.guide-close')],
      sections: sectionIds.map((id, index) => ({ trigger: triggers[index], select: () => setSection(id) })),
      onClose: () => closeRef.current(),
      deferDetailFocus: true,
    });
    drawer.open();
    return () => drawer.destroy();
  }, []);

  return (
    <dialog ref={dialogRef} className="about-dialog guide-drawer" aria-labelledby="guide-title">
      <div className="guide-panels guide-drawer-panels">
        <section className="guide-shell guide-drawer-overview">
          <header className="guide-header guide-drawer-header">
            <h2
              ref={headingRef}
              tabIndex={-1}
              id="guide-title"
              className="eyebrow"
            >
              A BIT OF EARTH
            </h2>
            <button
              type="button"
              className="guide-close guide-drawer-close"
              aria-label={copy.closeGuide}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div className="guide-content guide-drawer-scroll">
            <EarthIntro copy={copy} lang={lang} />
            <nav className="guide-model-details" aria-label={copy.guideSections}>
              {sectionIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="guide-section-trigger guide-drawer-section"
                  aria-controls="guide-detail"
                  aria-expanded="false"
                >
                  <span>{copy[id]}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))}
            </nav>
          </div>
        </section>
        <section
          id="guide-detail"
          className="guide-detail-panel guide-drawer-detail"
          aria-labelledby="guide-detail-title"
          aria-hidden="true"
          inert
        >
          <header className="guide-header guide-detail-header guide-drawer-header guide-drawer-detail-header">
            <button
              type="button"
              className="guide-back guide-drawer-back"
              aria-label={copy.backToGuide}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              <span>{copy.back}</span>
            </button>
            <button
              type="button"
              className="guide-close guide-drawer-close"
              aria-label={copy.closeGuide}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div ref={detailContentRef} className="guide-content model-details guide-drawer-scroll">
            <h2 ref={detailHeadingRef} tabIndex={-1} id="guide-detail-title">
              {activeTitle}
            </h2>
            <ModelDetails key={section} section={section} lang={lang} copy={copy} />
          </div>
        </section>
      </div>
    </dialog>
  );
}
