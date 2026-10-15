import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { locationSearchProvider } from '../lib/locations';
import './About.css';

function EarthIllustration() {
  return (
    <svg viewBox="0 0 440 230" className="guide-art" aria-hidden="true">
      <defs>
        <clipPath id="guide-earth-clip">
          <circle cx="133" cy="106" r="70" />
        </clipPath>
      </defs>
      <circle className="art-orbit" cx="133" cy="106" r="87" />
      <circle className="art-water" cx="133" cy="106" r="70" />
      <g className="art-land" clipPath="url(#guide-earth-clip)">
        <path d="M85 56l20-12 26 4 5 17-15 15-3 15-17 4-15-17-12-6zM117 103l21 5 12 19-9 19-13 20-8-10 2-24-12-15zM152 45l19 8 21 20 7 20-18 4-13-13-14 7-13-10 4-16z" />
        <path d="M152 94l22-5 12 18-6 24-18 12-10-21-8-12zM175 143l17-6 7 16-11 10-19-5zM103 169l30 4 26-5 14 4-24 4-32-1z" />
      </g>
      <g className="art-grid" fill="none">
        <ellipse cx="133" cy="106" rx="32" ry="70" />
        <path d="M69 80q64 24 128 0M63 106h140M69 132q64-24 128 0" />
        <circle cx="133" cy="106" r="70" />
      </g>
      <path
        className="art-connector"
        d="M232 106h29m-7-7 7 7-7 7"
        fill="none"
      />
      {[0, 1, 2].map((index) => (
        <g key={index} transform={`translate(0, ${-index * 14})`}>
          <path
            className="art-coin-edge"
            d="M288 106v14c0 9 17 16 38 16s38-7 38-16v-14z"
          />
          <ellipse className="art-coin" cx="326" cy="106" rx="38" ry="16" />
          <text className="art-coin-glyph" x="326" y="112" textAnchor="middle">
            ₿
          </text>
        </g>
      ))}
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
            an equivalent flat square. Readouts round to the nearest displayed
            decimal; the map uses the unrounded area.
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
            Your Bitcoin amount stays in your browser. The app uses no
            analytics, session recording or tracking cookies. Only theme and
            measurement preferences are stored between visits.
          </p>
          <p>
            Submitted searches go to {locationSearchProvider}; maps load from{' '}
            <a
              href="https://openfreemap.org/privacy/"
              target="_blank"
              rel="noreferrer"
            >
              OpenFreeMap
            </a>
            . These services receive your IP address and can see searches or
            viewed areas.
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
          <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">
            Photon · location search <ExternalLink size={14} />
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
              HOW IT WORKS
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
              aria-label="Back to How it works"
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
            <p className="guide-detail-eyebrow eyebrow">HOW IT WORKS</p>
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
