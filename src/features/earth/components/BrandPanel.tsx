import { Info } from 'lucide-react';
import './BrandPanel.css';

interface BrandPanelProps {
  onAbout: () => void;
}

export default function BrandPanel({ onAbout }: BrandPanelProps) {
  return (
    <aside className="sidebar" aria-label="A Bit of Earth controls">
      <div className="panel-header">
        <a
          className="brand"
          href={window.location.pathname}
          aria-label="A Bit of Earth home"
        >
          <span className="brand-name">
            A <span className="brand-bit">Bit</span> of Earth
          </span>
        </a>
        <button
          className="about-help"
          type="button"
          onClick={onAbout}
          aria-label="How does this work?"
          title="How does this work?"
          aria-haspopup="dialog"
        >
          <Info size={20} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
