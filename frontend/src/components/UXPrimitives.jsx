import React from 'react';
import './UXPrimitives.css';

export function CompactPageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <header className="compact-page-header">
      <div className="compact-page-header__copy">
        {eyebrow && <p className="compact-page-header__eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
      {actions && <div className="compact-page-header__actions">{actions}</div>}
    </header>
  );
}

export function CalmEmptyState({ title, children, action }) {
  return (
    <div className="calm-empty-state" role="status">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action && <div className="calm-empty-state__action">{action}</div>}
    </div>
  );
}

export function CompactActionSummary({
  eyebrow,
  title,
  label,
  primary,
  description,
  action,
  secondary,
  className = '',
}) {
  return (
    <section className={`compact-action-summary ${className}`.trim()}>
      <header className="compact-action-summary__header">
        {eyebrow && <p>{eyebrow}</p>}
        <h2>{title}</h2>
      </header>
      <div className="compact-action-summary__body" aria-live="polite">
        <div className="compact-action-summary__copy">
          {label && <span>{label}</span>}
          <strong>{primary}</strong>
          {description && <p>{description}</p>}
        </div>
        {action && <div className="compact-action-summary__action">{action}</div>}
      </div>
      {secondary && <div className="compact-action-summary__secondary">{secondary}</div>}
    </section>
  );
}

export function SecondarySection({
  summary,
  hint,
  children,
  open = false,
  className = '',
  onToggle,
}) {
  return (
    <details
      className={`secondary-section ${className}`.trim()}
      open={open}
      onToggle={onToggle}
    >
      <summary>
        <span>{summary}</span>
        {hint && <small>{hint}</small>}
      </summary>
      <div className="secondary-section__body">{children}</div>
    </details>
  );
}
