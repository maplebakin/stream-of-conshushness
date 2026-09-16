import { ChevronLeft, ChevronRight } from 'lucide-react';
import './MobileDateNavigator.css';

export default function MobileDateNavigator({
  label,
  onPrevious,
  onNext,
  onToday,
  showToday = false,
  className = '',
}) {
  return (
    <div className={`mobile-date-navigator ${className}`.trim()}>
      <button type="button" className="mobile-date-navigator__arrow" onClick={onPrevious} aria-label="Previous day">
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span className="mobile-date-navigator__label" aria-live="polite">{label}</span>
      <button type="button" className="mobile-date-navigator__arrow" onClick={onNext} aria-label="Next day">
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      {showToday && (
        <button type="button" className="mobile-date-navigator__today" onClick={onToday}>
          Today
        </button>
      )}
    </div>
  );
}
