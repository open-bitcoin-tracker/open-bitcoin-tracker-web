import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import './About.css';

function EarthIllustration() {
  return (
    <svg
      viewBox="0 0 440 200"
      className="guide-art"
      role="img"
      aria-label="1 BTC corresponds to approximately 7.1 square kilometres of Earth's land. Schematic, not to scale."
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
        <tspan className="art-bitcoin-label">1 BTC</tspan> ≈ 7.1 km²
      </text>
    </svg>
  );
}

const guideSections = [
  { id: 'calculation', title: 'The calculation' },
  { id: 'shape', title: 'The shape & its limits' },
  { id: 'privacy', title: 'Privacy' },
  { id: 'sources', title: 'Sources' },
] as const;

type GuideSection = (typeof guideSections)[number]['id'];

function ModelDetails({ section }: { section: GuideSection }) {
  switch (section) {
    case 'calculation':
      return (
        <div className="detail-content">
          <div className="model-assumptions">
            <div>
              <span>Maximum Bitcoin supply</span>
              <strong>21 million BTC</strong>
            </div>
            <div>
              <span>Earth’s land area</span>
              <strong>148,940,000 km²</strong>
            </div>
          </div>
          <code>Area = (BTC ÷ 21,000,000) × 148,940,000 km²</code>
          <p>
            1 BTC ≈ 7.1 km², with an equivalent flat square about 2.66 km per side. Land
            includes Antarctica and other ice-covered land, and excludes oceans.
            You can place the comparison over water.
          </p>
          <p>
            Side length is the square root of the unrounded area, expressed as
            an equivalent flat square. The map uses the unrounded area.
          </p>
          <p>
            This model describes scale. It does not describe land prices or
            ownership of a parcel.
          </p>
        </div>
      );
    case 'shape':
      return (
        <div className="detail-content">
          <p>
            The square follows latitude and longitude lines on a spherical
            Earth. Its north–south and east–west sides match at its center. We
            recalculate it and check its surface area with Turf whenever it
            moves.
          </p>
          <p>
            Map projections can distort how it looks at high latitudes. For very
            large areas or locations where the geographic square cannot fit, we
            show an approximate square using the local map scale. You can keep
            panning and zooming to compare its size. The numerical area stays
            accurate.
          </p>
          <p>
            Measurements are approximate, using a mean Earth radius of
            6,371.0088 km.
          </p>
        </div>
      );
    case 'privacy':
      return (
        <div className="detail-content">
          <p>
            Amounts are fixed examples. Country filtering and selections stay in
            this tab and are not saved. The app uses no
            analytics, session recording or tracking cookies. Your theme
            preference is stored between visits.
          </p>
          <p>
            Maps load from{' '}
            <a
              href="https://openfreemap.org/privacy/"
              target="_blank"
              rel="noreferrer"
            >
              OpenFreeMap
            </a>
            . This service receives your IP address and requests for viewed
            areas. Country filtering does not contact an external search service.
          </p>
        </div>
      );
    case 'sources':
      return (
        <div className="detail-content model-sources">
          <a
            href="https://bitcoin.org/en/halving"
            target="_blank"
            rel="noreferrer"
          >
            Bitcoin.org · supply cap <ExternalLink size={14} />
          </a>
          <a
            href="https://www.cia.gov/the-world-factbook/static/6c4d9b9a41b27707b6720720df7161d6/Physical_World.pdf"
            target="_blank"
            rel="noreferrer"
          >
            CIA · land-area reference <ExternalLink size={14} />
          </a>
          <p>
            The original CIA PDF link now redirects to the World Factbook
            retirement notice. This model keeps the fixed 148,940,000 km²
            assumption.
          </p>
          <a
            href="https://openfreemap.org/quick_start/"
            target="_blank"
            rel="noreferrer"
          >
            OpenFreeMap · map service <ExternalLink size={14} />
          </a>
          <a href="https://github.com/mledoze/countries" target="_blank" rel="noreferrer">
            mledoze/countries · capital names (ODbL) <ExternalLink size={14} />
          </a>
          <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">
            Natural Earth · capital coordinates <ExternalLink size={14} />
          </a>
          <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
            GeoNames · additional capital coordinates (CC BY 4.0) <ExternalLink size={14} />
          </a>
        </div>
      );
  }
}

interface AboutProps {
  onClose: () => void;
}

export default function About({ onClose }: AboutProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailContentRef = useRef<HTMLDivElement>(null);
  const sectionTriggers = useRef(new Map<GuideSection, HTMLButtonElement>());
  const [section, setSection] = useState<GuideSection>('calculation');
  const [detailOpen, setDetailOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [narrow, setNarrow] = useState(
    () => window.matchMedia('(max-width: 899px)').matches,
  );
  const activeTitle = guideSections.find((item) => item.id === section)!.title;

  useEffect(() => {
    const dialog = dialogRef.current!;
    const prior = document.activeElement as HTMLElement | null;
    dialog.showModal();
    headingRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      prior?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const update = () => setNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    const frame = requestAnimationFrame(() => {
      detailContentRef.current?.scrollTo(0, 0);
      detailHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [detailOpen, section, narrow]);

  useEffect(() => {
    if (!closing) return;
    // Finish closing even if an animation is interrupted or disabled mid-flight.
    const timeout = window.setTimeout(onClose, 350);
    return () => window.clearTimeout(timeout);
  }, [closing, onClose]);

  function closeGuide() {
    if (closing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
    } else {
      setClosing(true);
    }
  }

  function closeDetail() {
    if (closing) return;
    setDetailOpen(false);
    // The overview becomes interactive again before restoring focus on mobile.
    requestAnimationFrame(() => sectionTriggers.current.get(section)?.focus());
  }

  return (
    <dialog
      ref={dialogRef}
      className={`about-dialog${detailOpen ? ' about-dialog-detail-open' : ''}${closing ? ' about-dialog-closing' : ''}`}
      aria-labelledby="guide-title"
      onCancel={(event) => {
        event.preventDefault();
        if (closing) return;
        if (detailOpen) closeDetail();
        else closeGuide();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeGuide();
      }}
      onAnimationEnd={(event) => {
        if (
          closing &&
          event.target === event.currentTarget &&
          event.animationName === 'guide-slide-out'
        ) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href]',
          ),
        ).filter(
          (control) =>
            !control.closest('[inert]') && control.getClientRects().length > 0,
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === headingRef.current ||
            document.activeElement === detailHeadingRef.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey) {
          if (document.activeElement === detailHeadingRef.current) {
            event.preventDefault();
            (
              controls.find((control) => control.closest('#guide-detail')) ??
              first
            )?.focus();
          } else if (
            document.activeElement === last ||
            document.activeElement === headingRef.current
          ) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="guide-panels">
        <section className="guide-shell" inert={narrow && detailOpen}>
          <header className="guide-header">
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
              className="guide-close"
              aria-label="Close guide"
              onClick={closeGuide}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div className="guide-content">
            <div className="guide-intro">
              <div className="guide-illustration">
                <EarthIllustration />
              </div>
              <div className="guide-copy">
                <p className="guide-description">
                  Imagine dividing Earth’s land into 21 million equal shares,
                  one for every Bitcoin that can ever exist.
                </p>
                <p className="guide-note">
                  All land counts, including Antarctica. Oceans don’t.
                </p>
              </div>
            </div>
            <nav className="guide-model-details" aria-label="Guide sections">
              {guideSections.map((item) => (
                <button
                  key={item.id}
                  ref={(element) => {
                    if (element) sectionTriggers.current.set(item.id, element);
                    else sectionTriggers.current.delete(item.id);
                  }}
                  type="button"
                  className="guide-section-trigger"
                  aria-controls="guide-detail"
                  aria-expanded={detailOpen && section === item.id}
                  onClick={() => {
                    if (closing) return;
                    if (detailOpen && section === item.id) {
                      closeDetail();
                    } else {
                      setSection(item.id);
                      setDetailOpen(true);
                    }
                  }}
                >
                  <span>{item.title}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))}
            </nav>
          </div>
        </section>
        <section
          id="guide-detail"
          className="guide-detail-panel"
          aria-labelledby="guide-detail-title"
          aria-hidden={!detailOpen}
          inert={!detailOpen}
        >
          <header className="guide-header guide-detail-header">
            <button
              type="button"
              className="guide-back"
              aria-label="Back to A Bit of Earth"
              onClick={closeDetail}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              <span>Back</span>
            </button>
            <button
              type="button"
              className="guide-close"
              aria-label="Close guide"
              onClick={closeGuide}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div ref={detailContentRef} className="guide-content model-details">
            <p className="guide-detail-eyebrow eyebrow">A BIT OF EARTH</p>
            <h2 ref={detailHeadingRef} tabIndex={-1} id="guide-detail-title">
              {activeTitle}
            </h2>
            <ModelDetails key={section} section={section} />
          </div>
        </section>
      </div>
    </dialog>
  );
}
