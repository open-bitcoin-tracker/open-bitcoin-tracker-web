import type { EarthCopy } from '../../../i18n/earth';
import { LAND_KM2, MAX_BTC, toArea } from '../lib/bitcoin';
import { createGuideDrawer } from '../../../lib/guide-drawer';
import '../../../styles/guide-drawer.css';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import './About.css';

function EarthIllustration({ copy, format }: { copy: EarthCopy; format: Intl.NumberFormat }) {
  return (
    <svg
      viewBox="0 0 440 200"
      className="guide-art"
      role="img"
      aria-label={copy.illustration.replace('{area}', format.format(toArea(1)))}
    >
      <defs>
        <clipPath id="guide-earth-clip">
          <circle cx="110" cy="100" r="80" />
        </clipPath>
      </defs>
      <circle className="art-water" cx="110" cy="100" r="80" />
      <g className="art-land" clipPath="url(#guide-earth-clip)">
        {/* Simplified Atlantic-facing continents, including Antarctica. */}
        <path d="M29 56Q43 36 65 30L79 35 83 43 96 45 100 54 91 62 83 64 79 75 70 78 65 88 68 98 78 105 82 112 76 114 68 104 60 99 55 88 44 83 39 72 29 68Z" />
        <path d="M80 112L91 110 102 117 107 125 119 129 117 141 108 150 105 160 95 173 90 171 90 157 85 146 82 135 76 126Z" />
        <path d="M99 25L112 21 126 26 122 37 114 48 106 44 102 35Z" />
        <path d="M144 42L153 34 158 42 154 53 162 59 175 55 193 62 201 81 188 94 178 91 168 84 158 85 150 78 141 80 136 74 143 66 138 59Z" />
        <path d="M141 88L155 86 166 94 168 106 177 111 169 122 163 125 157 144 149 153 141 146 138 132 132 122 124 113 124 100 131 91Z" />
        <path d="M173 137L176 132 178 139 175 149 171 150Z" />
        <path d="M52 171Q76 165 93 172L112 170 127 173 146 168 170 173 174 187H47Z" />
      </g>
      <g className="art-grid" fill="none">
        <ellipse cx="110" cy="100" rx="36" ry="80" />
        <path d="M41 60Q110 83 179 60M30 100H190M41 140Q110 117 179 140" />
      </g>
      <circle className="art-rim" cx="110" cy="100" r="80" />
      <path
        className="art-connector"
        d="M201 100H239L268 71"
        fill="none"
      />
      <rect className="art-area" x="280" y="42" width="102" height="102" />
      <text className="art-area-label" x="331" y="177" textAnchor="middle">
        <tspan className="art-bitcoin-label">1 BTC</tspan> ≈ {format.format(toArea(1))} km²
      </text>
    </svg>
  );
}

const sectionIds = ['calculation', 'privacy', 'sources'] as const;
type GuideSection = (typeof sectionIds)[number];

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
        </div>
      );
    }
    case 'sources':
      return (
        <div className="detail-content model-sources">
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
  const format = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
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
            <div className="guide-intro">
              <div className="guide-illustration">
                <EarthIllustration copy={copy} format={format} />
              </div>
              <div className="guide-copy">
                <p className="guide-description">
                  {copy.intro}
                </p>
                <p className="guide-note">
                  {copy.landNote}
                </p>
              </div>
            </div>
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
            <p className="guide-detail-eyebrow eyebrow">A BIT OF EARTH</p>
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
