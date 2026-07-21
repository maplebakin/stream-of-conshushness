import { Link } from 'react-router-dom';
import './ReviewInboxSummary.css';

const REVIEW_LINKS = [
  { key: 'tasks', label: 'Tasks', to: '/review' },
  { key: 'ripples', label: 'Ripples', to: '/ripples' },
  { key: 'gather', label: 'Gather', to: '/gather-lists' },
  { key: 'interests', label: 'Interests', to: '/interests' },
];

export default function ReviewInboxSummary({ counts = {}, total = 0, className = '' }) {
  return (
    <section className={`review-inbox-summary ${className}`.trim()} aria-labelledby="review-inbox-summary-title">
      <div className="review-inbox-summary__header">
        <div>
          <h2 id="review-inbox-summary-title">Review inbox</h2>
          <p>
            {total > 0
              ? `${total} useful ${total === 1 ? 'thread' : 'threads'} ready to review`
              : 'Nothing waiting for your say'}
          </p>
        </div>
        <Link className="review-inbox-summary__all" to="/review">Open review</Link>
      </div>
      <nav className="review-inbox-summary__links" aria-label="Review categories">
        {REVIEW_LINKS.map(({ key, label, to }) => {
          const count = Number(counts[key]) || 0;
          return (
            <Link key={key} to={to} className="review-inbox-summary__link">
              <span>{label}</span>
              <strong aria-label={`${count} pending ${label.toLowerCase()}`}>{count}</strong>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
