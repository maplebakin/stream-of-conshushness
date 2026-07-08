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

function sourcePreview(item) {
  return String(item.sourceText || item.sourceEntryExcerpt || '').trim();
}

function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [
    item.title,
    item.sourceText,
    item.sourceEntryExcerpt,
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

function editableSuggestion(kind) {
  return kind === 'suggestedTask' || kind === 'suggestedGatherItem' || kind === 'suggestedInterest';
}

function calendarItem(kind) {
  return kind === 'calendarAppointment' || kind === 'calendarEvent';
}

function suggestionPayload(item, draft = {}) {
  const payload = {};
  const title = suggestionTitle(item, draft);
  if (title && title !== item.title) payload.title = title;

  if (item.kind === 'suggestedTask') {
    const dueDate = String(draft.dueDate ?? item.dueDate ?? '').trim();
    if (dueDate) payload.dueDate = dueDate;
  }
  if (item.kind === 'suggestedGatherItem') {
    const list = String(draft.list ?? item.list ?? '').trim();
    if (list) payload.list = list;
  }
  if (item.kind === 'suggestedInterest') {
    const category = String(draft.category ?? item.category ?? '').trim();
    if (category) payload.category = category;
  }

  return payload;
}

function suggestionTitle(item, draft = {}) {
  return String(draft.title ?? item.title ?? '').trim();
}

function actionTitle(item, draft = {}) {
  return suggestionTitle(item, draft) || 'Untitled review item';
}

function acceptedTarget(item, result) {
  if (item.kind === 'suggestedTask') {
    const task = result?.task || result?.data?.task;
    return { label: 'Open task inbox', to: task?.dueDate ? `/day/${task.dueDate}` : '/inbox/tasks' };
  }
  if (item.kind === 'suggestedGatherItem') return { label: 'Open gather lists', to: '/gather-lists' };
  if (item.kind === 'suggestedInterest') return { label: 'Open interests', to: '/interests' };
  if (item.kind === 'ripple') return { label: 'Open ripples', to: '/ripples' };
  if (calendarItem(item.kind)) return { label: 'Open day', to: item.date ? `/day/${item.date}` : '/calendar' };
  return null;
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
  const [drafts, setDrafts] = useState({});
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [confirmingKey, setConfirmingKey] = useState('');
  const [bulkConfirmAction, setBulkConfirmAction] = useState('');
  const [completedItems, setCompletedItems] = useState([]);

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
  const selectedItems = useMemo(
    () => filteredItems.filter((item) => selectedKeys.has(itemKey(item))),
    [filteredItems, selectedKeys]
  );
  const selectedCount = selectedItems.length;
  const allVisibleSelected = visibleCount > 0 && filteredItems.every((item) => selectedKeys.has(itemKey(item)));
  const selectedHasCalendar = selectedItems.some((item) => calendarItem(item.kind));

  useEffect(() => {
    const availableKeys = new Set(items.map(itemKey));
    setSelectedKeys((current) => {
      const next = new Set([...current].filter((key) => availableKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  useEffect(() => {
    setConfirmingKey('');
    setBulkConfirmAction('');
  }, [activeGroup, normalizedQuery]);

  function setBusy(item, busy) {
    const key = itemKey(item);
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function setItemsBusy(reviewItems, busy) {
    setBusyIds((current) => {
      const next = new Set(current);
      reviewItems.forEach((item) => {
        const key = itemKey(item);
        if (busy) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  }

  function removeItem(item) {
    const key = itemKey(item);
    setItems((current) => current.filter((candidate) => itemKey(candidate) !== key));
    setSelectedKeys((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    if (confirmingKey === key) setConfirmingKey('');
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setCounts((current) => {
      const group = item.group;
      const next = { ...current };
      if (Number.isFinite(Number(next[group]))) next[group] = Math.max(0, Number(next[group]) - 1);
      if (Number.isFinite(Number(next.total))) next.total = Math.max(0, Number(next.total) - 1);
      return next;
    });
  }

  function toggleSelected(item) {
    const key = itemKey(item);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setBulkConfirmAction('');
  }

  function toggleVisibleSelection() {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        filteredItems.forEach((item) => next.delete(itemKey(item)));
      } else {
        filteredItems.forEach((item) => next.add(itemKey(item)));
      }
      return next;
    });
    setBulkConfirmAction('');
  }

  function clearSelection() {
    setSelectedKeys(new Set());
    setBulkConfirmAction('');
  }

  function updateDraft(item, field, value) {
    const key = itemKey(item);
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {}),
        [field]: value,
      },
    }));
  }

  async function performAction(item, action) {
    const id = item.id;
    if (!id) throw new Error('Review item is missing an id.');

    const draft = drafts[itemKey(item)] || {};
    if (action === 'primary' && editableSuggestion(item.kind) && !suggestionTitle(item, draft)) {
      throw new Error('Title is required before accepting this suggestion.');
    }

    if (item.kind === 'suggestedTask') {
      return api.put(
        `/api/suggested-tasks/${id}/${action === 'primary' ? 'accept' : 'reject'}`,
        action === 'primary' ? suggestionPayload(item, draft) : {}
      );
    } else if (item.kind === 'suggestedGatherItem') {
      if (action === 'primary') return acceptSuggestedGatherItem(id, suggestionPayload(item, draft));
      return rejectSuggestedGatherItem(id);
    } else if (item.kind === 'suggestedInterest') {
      if (action === 'primary') return acceptSuggestedInterest(id, suggestionPayload(item, draft));
      return rejectSuggestedInterest(id);
    } else if (item.kind === 'ripple') {
      if (action === 'primary') return approveRipple(id);
      return dismissRipple(id);
    } else if (item.kind === 'calendarAppointment') {
      if (action === 'primary') return api.patch(`/api/appointments/${id}`, {});
      return api.delete(`/api/appointments/${id}`);
    } else if (item.kind === 'calendarEvent') {
      if (action === 'primary') return api.patch(`/api/important-events/${id}`, { pinned: !!item.pinned });
      return api.delete(`/api/important-events/${id}`);
    }
    return null;
  }

  async function applyAction(item, action) {
    const key = itemKey(item);
    if (action === 'secondary' && calendarItem(item.kind) && confirmingKey !== key) {
      setConfirmingKey(key);
      return;
    }

    setConfirmingKey('');
    setBusy(item, true);
    try {
      const result = await performAction(item, action);
      removeItem(item);
      if (action === 'primary') {
        const target = acceptedTarget(item, result);
        if (target) {
          setCompletedItems((current) => [
            { key: `${Date.now()}:${itemKey(item)}`, title: actionTitle(item, drafts[key]), outcome: outcomeLabel(item.kind, action), ...target },
            ...current.slice(0, 4),
          ]);
        }
      }
      showToast(`${outcomeLabel(item.kind, action)} "${actionTitle(item, drafts[key])}"`, { type: 'success' });
    } catch (err) {
      console.error('[ReviewInbox] action failed:', err?.response?.data || err.message);
      showToast(err?.response?.data?.error || err.message || 'Could not update this review item.', { type: 'error' });
    } finally {
      setBusy(item, false);
    }
  }

  async function applyBulkAction(action) {
    if (!selectedItems.length) return;
    if (action === 'secondary' && selectedHasCalendar && bulkConfirmAction !== action) {
      setBulkConfirmAction(action);
      return;
    }

    setBulkConfirmAction('');
    setItemsBusy(selectedItems, true);
    const succeeded = [];
    const failed = [];

    for (const item of selectedItems) {
      try {
        const result = await performAction(item, action);
        succeeded.push({ item, result });
      } catch (err) {
        failed.push({ item, err });
      }
    }

    succeeded.forEach(({ item }) => removeItem(item));
    if (action === 'primary' && succeeded.length) {
      setCompletedItems((current) => [
        ...succeeded
          .map(({ item, result }) => {
            const target = acceptedTarget(item, result);
            return target
              ? { key: `${Date.now()}:${itemKey(item)}`, title: actionTitle(item, drafts[itemKey(item)]), outcome: outcomeLabel(item.kind, action), ...target }
              : null;
          })
          .filter(Boolean),
        ...current,
      ].slice(0, 5));
    }
    setItemsBusy(selectedItems, false);

    if (succeeded.length) {
      const verb = action === 'primary' ? 'Accepted/kept' : 'Rejected/dismissed';
      showToast(`${verb} ${succeeded.length} review item${succeeded.length === 1 ? '' : 's'}.`, { type: 'success' });
    }
    if (failed.length) {
      console.error('[ReviewInbox] bulk action failures:', failed.map(({ item, err }) => ({
        item: itemKey(item),
        error: err?.response?.data || err.message,
      })));
      showToast(`Could not update ${failed.length} selected item${failed.length === 1 ? '' : 's'}.`, { type: 'error' });
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

      {completedItems.length > 0 && (
        <section className="review-completed" aria-label="Recently accepted review items">
          {completedItems.map((item) => (
            <div key={item.key} className="review-completed__item">
              <span>{item.outcome} "{item.title}"</span>
              <Link to={item.to}>{item.label}</Link>
            </div>
          ))}
        </section>
      )}

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
        {!loading && !error && visibleCount > 0 && (
          <div className="review-inbox__bulk" aria-label="Bulk review actions">
            <label className="review-inbox__select-visible">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleVisibleSelection}
              />
              <span>{allVisibleSelected ? 'Deselect visible' : 'Select visible'}</span>
            </label>
            <span className="review-inbox__selected-count">
              {selectedCount ? `${selectedCount} selected` : `${visibleCount} in this view`}
            </span>
            <div className="review-inbox__bulk-actions">
              <button
                type="button"
                className="review-button review-button--primary"
                onClick={() => applyBulkAction('primary')}
                disabled={!selectedCount}
              >
                <Check size={16} aria-hidden="true" />
                Accept or keep selected
              </button>
              <button
                type="button"
                className="review-button review-button--danger"
                onClick={() => applyBulkAction('secondary')}
                disabled={!selectedCount}
              >
                <X size={16} aria-hidden="true" />
                {bulkConfirmAction === 'secondary' && selectedHasCalendar
                  ? 'Confirm dismiss selected'
                  : 'Reject or dismiss selected'}
              </button>
              {selectedCount > 0 && (
                <button type="button" className="review-button review-button--ghost" onClick={clearSelection}>
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
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
            const key = itemKey(item);
            const labels = actionLabels(item.kind);
            const busy = busyIds.has(key);
            const date = visibleDate(item);
            const source = sourceLabel(item);
            const draft = drafts[key] || {};
            const canEdit = editableSuggestion(item.kind);
            const selected = selectedKeys.has(key);
            const confirmDismiss = confirmingKey === key;
            const preview = sourcePreview(item);

            return (
              <article key={key} className={`review-inbox-item review-inbox-item--${item.group}${selected ? ' is-selected' : ''}`}>
                <label className="review-inbox-item__select">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelected(item)}
                    disabled={busy}
                    aria-label={`Select ${actionTitle(item, draft)}`}
                  />
                </label>
                <div className="review-inbox-item__body">
                  <div className="review-inbox-item__kicker">
                    <span>{KIND_LABELS[item.kind] || item.kind}</span>
                    {date && <span>{date}</span>}
                  </div>
                  {canEdit ? (
                    <div className="review-edit-grid">
                      <label className="review-edit-field review-edit-field--wide">
                        <span>Title</span>
                        <input
                          value={draft.title ?? item.title ?? ''}
                          onChange={(event) => updateDraft(item, 'title', event.target.value)}
                          disabled={busy}
                        />
                      </label>
                      {item.kind === 'suggestedTask' && (
                        <label className="review-edit-field">
                          <span>Due date</span>
                          <input
                            type="date"
                            value={draft.dueDate ?? item.dueDate ?? ''}
                            onChange={(event) => updateDraft(item, 'dueDate', event.target.value)}
                            disabled={busy}
                          />
                        </label>
                      )}
                      {item.kind === 'suggestedGatherItem' && (
                        <label className="review-edit-field">
                          <span>List</span>
                          <input
                            value={draft.list ?? item.list ?? ''}
                            onChange={(event) => updateDraft(item, 'list', event.target.value)}
                            disabled={busy}
                          />
                        </label>
                      )}
                      {item.kind === 'suggestedInterest' && (
                        <label className="review-edit-field">
                          <span>Category</span>
                          <input
                            value={draft.category ?? item.category ?? ''}
                            onChange={(event) => updateDraft(item, 'category', event.target.value)}
                            disabled={busy}
                          />
                        </label>
                      )}
                    </div>
                  ) : (
                    <h2>{item.title || 'Untitled review item'}</h2>
                  )}
                  {preview && (
                    <p className="review-source-preview">
                      <span>{item.sourceText ? 'Source text' : 'Source entry'}</span>
                      {preview}
                    </p>
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
                    {confirmDismiss ? 'Confirm dismiss' : labels.secondary}
                  </button>
                  {confirmDismiss && (
                    <button
                      type="button"
                      className="review-button review-button--ghost"
                      onClick={() => setConfirmingKey('')}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
