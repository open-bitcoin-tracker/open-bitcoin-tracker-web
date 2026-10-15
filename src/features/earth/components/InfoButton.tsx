import { Info } from 'lucide-react';
import './InfoButton.css';

interface InfoButtonProps {
  onAbout: () => void;
}

export default function InfoButton({ onAbout }: InfoButtonProps) {
  return (
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
  );
}
