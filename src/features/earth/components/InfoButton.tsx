import type { EarthCopy } from '../../../i18n/earth';
import { useState } from 'react';
import './InfoButton.css';

interface InfoButtonProps {
  copy: EarthCopy;
  onAbout: () => void;
}

export default function InfoButton({ copy, onAbout }: InfoButtonProps) {
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
      aria-label={copy.help}
      aria-haspopup="dialog"
    >
      <span aria-hidden="true">?</span>
      <span className="about-help-tooltip" aria-hidden="true">
        {copy.help}
      </span>
    </button>
  );
}
