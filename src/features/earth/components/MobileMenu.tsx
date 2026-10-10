import { useEffect, useId, useRef, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import BrandPanel from './BrandPanel';
import './MobileMenu.css';

interface MobileMenuProps {
  onAbout: () => void;
}

export default function MobileMenu({ onAbout }: MobileMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const id = useId();

  function closeMenu(then?: () => void) {
    afterClose.current = then;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialogRef.current?.close();
    } else {
      setClosing(true);
    }
  }

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => dialogRef.current?.close(), 260);
    return () => window.clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 480px)');
    const closeOnWiderScreen = () => {
      if (!narrow.matches) dialogRef.current?.close();
    };
    narrow.addEventListener('change', closeOnWiderScreen);
    return () => narrow.removeEventListener('change', closeOnWiderScreen);
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="mobile-menu-trigger"
        aria-label="Map settings"
        title="Map settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (dialogRef.current?.open) return;
          setClosing(false);
          dialogRef.current?.showModal();
          setOpen(true);
        }}
      >
        <Settings2 size={22} aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        id={id}
        className={`mobile-menu${closing ? ' mobile-menu-closing' : ''}`}
        aria-label="A Bit of Earth settings"
        onClose={() => {
          setOpen(false);
          setClosing(false);
          triggerRef.current?.focus({ preventScroll: true });
          const next = afterClose.current;
          afterClose.current = undefined;
          next?.();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]'))
            .filter((control) => control.checkVisibility());
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          closeMenu();
        }}
        onAnimationEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.animationName === 'mobile-menu-slide-out'
          ) {
            dialogRef.current?.close();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
      >
        <div className="mobile-menu-content">
          <button
            type="button"
            className="mobile-menu-close"
            aria-label="Close map settings"
            onClick={() => closeMenu()}
          >
            <X size={22} aria-hidden="true" />
          </button>
          <BrandPanel onAbout={() => closeMenu(onAbout)} />
        </div>
      </dialog>
    </>
  );
}
