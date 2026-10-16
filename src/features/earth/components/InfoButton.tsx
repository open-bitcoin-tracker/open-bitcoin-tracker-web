import { useState } from 'react';
import './InfoButton.css';

interface InfoButtonProps {
  onAbout: () => void;
}

export default function InfoButton({ onAbout }: InfoButtonProps) {
  const [tooltipDismissed, setTooltipDismissed] = useState(false);

  return (
    <button
      className="about-help"
      type="button"
      onClick={() => {
        setTooltipDismissed(true);
        onAbout();
      }}
      onMouseEnter={() => setTooltipDismissed(false)}
      onFocus={() => setTooltipDismissed(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setTooltipDismissed(true);
      }}
      data-tooltip-dismissed={tooltipDismissed || undefined}
      aria-label="How does this work?"
      aria-haspopup="dialog"
    >
      <span aria-hidden="true">?</span>
      <span className="about-help-tooltip" aria-hidden="true">
        How does this work?
      </span>
    </button>
  );
}
