import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  Check,
  Inbox,
  Lightbulb,
  ListChecks,
  PackagePlus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import api from '../api/axiosInstance.js';
import { listReviewItems } from '../api/review.js';
import { acceptSuggestedGatherItem, rejectSuggestedGatherItem } from '../api/suggestedGatherItems.js';
import { acceptSuggestedInterest, rejectSuggestedInterest } from '../api/suggestedInterests.js';
import { approveRipple, dismissRipple } from '../api/ripples.js';
import { useToast } from '../hooks/useToast.js';
import './ReviewInbox.css';

const GROUPS = [
  { key: 'all', label: 'All', icon: Inbox },
  { key: 'tasks', label: 'Tasks', icon: ListChecks },
  { key: 'gather', label: 'Gather', icon: PackagePlus },
  { key: 'interests', label: 'Interests', icon: Sparkles },
  { key: 'ripples', label: 'Ripples', icon: Lightbulb },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
];

const KIND_LABELS = {
  suggestedTask: 'Task suggestion',
  suggestedGatherItem: 'Gather suggestion',
  suggestedInterest: 'Interest suggestion',
  ripple: 'Ripple',
  calendarAppointment: 'Appointment',
  calendarEvent: 'Important event',
};

function itemKey(item) {
  return `${item.kind}:${item.id}`;
}

function visibleDate(item) {
  return item.dueDate || item.date || item.sourceDate || '';
}

function sourceLabel(item) {
  if (item.sourceTitle && item.sourceDate) return `${item.sourceTitle} - ${item.sourceDate}`;
  if (item.sourceDate) return item.sourceDate;
  if (item.sourceEntryId) return 'Source entry';
  return '';
}

function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [
    item.title,
    item.sourceText,
    item.sourceTitle,
    item.sourceDate,
    item.date,
    item.dueDate,
    ...(Array.isArray(item.meta) ? item.meta : []),
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}

function actionLabels(kind) {
  if (kind === 'ripple') return { primary: 'Approve', secondary: 'Dismiss' };
  if (kind === 'calendarAppointment' || kind === 'calendarEvent') return { primary: 'Keep', secondary: 'Dismiss' };
  return { primary: 'Accept', secondary: 'Reject' };
}

function outcomeLabel(kind, action) {
  if (action === 'secondary') return kind === 'suggestedTask' || kind === 'suggestedGatherItem' || kind === 'suggestedInterest'
    ? 'Rejected'
    : 'Dismissed';
  if (kind === 'ripple') return 'Approved';
  if (kind === 'calendarAppointment' || kind === 'calendarEvent') return 'Kept';
  return 'Accepted';
}

export default function ReviewInbox() {
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeGroup, setActiveGroup] = useState('all');
  const [query, setQuery] = useState('');
  const [busyIds, setBusyIds] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listReviewItems();
      setItems(data.items);
      setCounts(data.counts);
    } catch (err) {
      console.error('[ReviewInbox] load failed:', err?.response?.data || err.message);
      setError(err?.response?.data?.error || 'Could not load the review inbox.');
      setItems([]);
      setCounts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => (
    items.filter((item) => (
      (activeGroup === 'all' || item.group === activeGroup) &&
      matchesSearch(item, normalizedQuery)
    ))
  ), [activeGroup, items, normalizedQuery]);

  const totalCount = Number(counts.total) || items.length;
  const visibleCount = filteredItems.length;

  function setBusy(item, busy) {
    const key = itemKey(item);
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function removeItem(item) {
    const key = itemKey(item);
    setItems((current) => current.filter((candidate) => itemKey(candidate) !== key));
    setCounts((current) => {
      const group = item.group;
      const next = { ...current };
      if (Number.isFinite(Number(next[group]))) next[group] = Math.max(0, Number(next[group]) - 1);
      if (Number.isFinite(Number(next.total))) next.total = Math.max(0, Number(next.total) - 1);
      return next;
    });
  }

  async function applyAction(item, action) {
    const id = item.id;
    if (!id) return;

    if (
      action === 'secondary' &&
      (item.kind === 'calendarAppointment' || item.kind === 'calendarEvent') &&
      !window.confirm(`Dismiss "${item.title}" from your calendar?`)
    ) {
      return;
    }

    setBusy(item, true);
    try {
      if (item.kind === 'suggestedTask') {
        await api.put(`/api/suggested-tasks/${id}/${action === 'primary' ? 'accept' : 'reject'}`);
      } else if (item.kind === 'suggestedGatherItem') {
        if (action === 'primary') await acceptSuggestedGatherItem(id);
        else await rejectSuggestedGatherItem(id);
      } else if (item.kind === 'suggestedInterest') {
        if (action === 'primary') await acceptSuggestedInterest(id);
        else await rejectSuggestedInterest(id);
      } else if (item.kind === 'ripple') {
        if (action === 'primary') await approveRipple(id);
        else await dismissRipple(id);
      } else if (item.kind === 'calendarAppointment') {
        if (action === 'primary') await api.patch(`/api/appointments/${id}`, {});
        else await api.delete(`/api/appointments/${id}`);
      } else if (item.kind === 'calendarEvent') {
        if (action === 'primary') await api.patch(`/api/important-events/${id}`, { pinned: !!item.pinned });
        else await api.delete(`/api/important-events/${id}`);
      }

      removeItem(item);
      showToast(`${outcomeLabel(item.kind, action)} "${item.title}"`, { type: 'success' });
    } catch (err) {
      console.error('[ReviewInbox] action failed:', err?.response?.data || err.message);
      showToast(err?.response?.data?.error || 'Could not update this review item.', { type: 'error' });
    } finally {
      setBusy(item, false);
    }
  }

  return (
    <div className="page review-inbox">
      <header className="page-header review-inbox__header">
        <div>
          <h1 className="page-title">Review Inbox</h1>
          <p className="page-subtitle">
            Tasks, gather items, interests, ripples, and entry-created calendar items waiting for a decision.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="review-button review-button--ghost" onClick={load} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            {loading ? 'Loading' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="review-inbox__toolbar" aria-label="Review filters">
        <div className="review-inbox__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search review items"
            aria-label="Search review items"
          />
        </div>
        <div className="review-inbox__tabs" role="tablist" aria-label="Review groups">
          {GROUPS.map((group) => {
            const Icon = group.icon;
            const active = activeGroup === group.key;
            const count = group.key === 'all' ? totalCount : Number(counts[group.key]) || 0;

            return (
              <button
                key={group.key}
                type="button"
                className={`review-inbox__tab${active ? ' is-active' : ''}`}
                onClick={() => setActiveGroup(group.key)}
                role="tab"
                aria-selected={active}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{group.label}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </div>
      </section>

      {loading && <div className="review-empty">Loading review items...</div>}
      {!loading && error && <div className="alert error">{error}</div>}
      {!loading && !error && visibleCount === 0 && (
        <div className="review-empty">
          No review items match this view.
        </div>
      )}

      {!loading && !error && visibleCount > 0 && (
        <section className="review-inbox__list" aria-label={`${visibleCount} review items`}>
          {filteredItems.map((item) => {
            const labels = actionLabels(item.kind);
            const busy = busyIds.has(itemKey(item));
            const date = visibleDate(item);
            const source = sourceLabel(item);

            return (
              <article key={itemKey(item)} className={`review-inbox-item review-inbox-item--${item.group}`}>
                <div className="review-inbox-item__body">
                  <div className="review-inbox-item__kicker">
                    <span>{KIND_LABELS[item.kind] || item.kind}</span>
                    {date && <span>{date}</span>}
                  </div>
                  <h2>{item.title || 'Untitled review item'}</h2>
                  {item.sourceText && (
                    <p className="review-card__source">source: "{item.sourceText}"</p>
                  )}
                  <div className="review-inbox-item__meta">
                    {Array.isArray(item.meta) && item.meta.map((meta) => (
                      <span key={meta} className="review-pill">{meta}</span>
                    ))}
                    {source && item.sourceDate ? (
                      <Link to={`/day/${item.sourceDate}`} className="review-pill review-inbox-item__source-link">
                        {source}
                      </Link>
                    ) : source ? (
                      <span className="review-pill">{source}</span>
                    ) : null}
                  </div>
                </div>

                <div className="review-inbox-item__actions">
                  <button
                    type="button"
                    className="review-button review-button--primary"
                    onClick={() => applyAction(item, 'primary')}
                    disabled={busy}
                  >
                    <Check size={16} aria-hidden="true" />
                    {labels.primary}
                  </button>
                  <button
                    type="button"
                    className="review-button review-button--danger"
                    onClick={() => applyAction(item, 'secondary')}
                    disabled={busy}
                  >
                    <X size={16} aria-hidden="true" />
                    {labels.secondary}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
