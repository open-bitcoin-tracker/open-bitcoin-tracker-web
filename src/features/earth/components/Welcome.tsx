import { useEffect, useRef, useState } from 'react';
import type { EarthCopy } from '../../../i18n/earth';
import { hideWelcomeOnFutureVisits } from '../lib/welcomePreference';
import EarthIntro from './EarthIntro';
import './Welcome.css';

export default function Welcome({ copy, lang, onClose }: { copy: EarthCopy; lang: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeTimeout = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const returnFocus = document.querySelector<HTMLButtonElement>('.earth-feature .about-help');
    dialog.showModal();
    headingRef.current?.focus({ preventScroll: true });
    return () => {
      window.clearTimeout(closeTimeout.current);
      dialog.close();
      returnFocus?.focus({ preventScroll: true });
    };
  }, []);

  function dismiss() {
    if (closingRef.current) return;
    closingRef.current = true;
    if (dontShowAgain) hideWelcomeOnFutureVisits();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setClosing(true);
    // Reveal the map even if the exit animation is interrupted.
    closeTimeout.current = window.setTimeout(onClose, 400);
  }

  return (
    <dialog
      ref={dialogRef}
      className="earth-welcome"
      data-closing={closing || undefined}
      aria-labelledby="earth-welcome-title"
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      onAnimationEnd={(event) => {
        if (closingRef.current && event.target === event.currentTarget && event.animationName === 'earth-welcome-out') {
          window.clearTimeout(closeTimeout.current);
          onClose();
        }
      }}
    >
      <header className="earth-welcome-header">
        <h2 ref={headingRef} tabIndex={-1} id="earth-welcome-title">A BIT OF EARTH</h2>
      </header>
      <EarthIntro copy={copy} lang={lang} />
      <footer className="earth-welcome-footer">
        <label className="earth-welcome-preference">
          <input type="checkbox" checked={dontShowAgain} disabled={closing} onChange={(event) => setDontShowAgain(event.target.checked)} />
          <span>{copy.dontShowAgain}</span>
        </label>
        <button type="button" className="earth-welcome-explore" onClick={dismiss} disabled={closing}>{copy.exploreMap}</button>
      </footer>
    </dialog>
  );
}
