import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { EarthCopy } from '../../../i18n/earth';
import { hideWelcomeOnFutureVisits } from '../lib/welcomePreference';
import EarthIntro from './EarthIntro';
import './Welcome.css';

export default function Welcome({ copy, lang, onClose }: { copy: EarthCopy; lang: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const returnFocus = document.querySelector<HTMLButtonElement>('.earth-feature .about-help');
    dialog.showModal();
    return () => {
      dialog.close();
      returnFocus?.focus({ preventScroll: true });
    };
  }, []);

  function dismiss() {
    if (dontShowAgain) hideWelcomeOnFutureVisits();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="earth-welcome"
      aria-labelledby="earth-welcome-title"
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
    >
      <header className="earth-welcome-header">
        <h2 id="earth-welcome-title">A BIT OF EARTH</h2>
        <button type="button" className="earth-welcome-close" aria-label={copy.closeGuide} onClick={dismiss} autoFocus>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <EarthIntro copy={copy} lang={lang} />
      <footer className="earth-welcome-footer">
        <label className="earth-welcome-preference">
          <input type="checkbox" checked={dontShowAgain} onChange={(event) => setDontShowAgain(event.target.checked)} />
          <span>{copy.dontShowAgain}</span>
        </label>
        <button type="button" className="earth-welcome-explore" onClick={dismiss}>{copy.exploreMap}</button>
      </footer>
    </dialog>
  );
}
