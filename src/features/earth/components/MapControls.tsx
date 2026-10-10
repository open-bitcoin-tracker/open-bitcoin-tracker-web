import { Moon, Sun } from 'lucide-react';
import type { Theme } from '../lib/theme';
import './MapControls.css';

interface MapControlsProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export default function MapControls({
  theme,
  onThemeChange,
}: MapControlsProps) {
  return (
    <div className="floating-map-controls">
      <section className="appearance-panel" aria-label="Appearance controls">
        <div className="theme-switcher" role="group" aria-label="Appearance">
          <button
            type="button"
            aria-label="Light theme"
            title="Light"
            aria-pressed={theme === 'light'}
            onClick={() => onThemeChange('light')}
          >
            <Sun size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Dark theme"
            title="Dark"
            aria-pressed={theme === 'dark'}
            onClick={() => onThemeChange('dark')}
          >
            <Moon size={18} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}
