import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  acceptSuggestedTask,
  acceptScheduleSuggestion,
  dismissCalendarAppointment,
  dismissCalendarEvent,
  keepCalendarAppointment,
  keepCalendarEvent,
  listReviewItems,
  moveTaskToDate,
  rejectSuggestedTask,
  rejectScheduleSuggestion,
} from '../api/review.js';
import { acceptSuggestedGatherItem, rejectSuggestedGatherItem } from '../api/suggestedGatherItems.js';
import { acceptSuggestedInterest, rejectSuggestedInterest } from '../api/suggestedInterests.js';
import { approveRipple, dismissRipple } from '../api/ripples.js';
import { useToast } from '../hooks/useToast.js';
import { todayISOInToronto } from '../utils/date.js';
import { sourceEntryPath, sourceStateLabel } from '../utils/sourceEntryState.js';
import { requestErrorSummary } from '../utils/requestError.js';
import { CalmEmptyState, SecondarySection } from '../components/UXPrimitives.jsx';
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
  scheduleSuggestion: 'Schedule update',
};

function itemKey(item) {
  return `${item.kind}:${item.id}`;
}

function visibleDate(item) {
  return item.dueDate || item.date || item.sourceDate || '';
}

function readableDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value || '';
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function sourceLabel(item) {
  const unavailable = sourceStateLabel(item);
  if (unavailable) return unavailable;
  if (item.sourceTitle && item.sourceDate) return `${item.sourceTitle} · ${readableDate(item.sourceDate)}`;
  if (item.sourceDate) return readableDate(item.sourceDate);
  if (item.sourceEntryId) return 'Source entry';
  return '';
}

function sourcePreview(item) {
  return String(item.sourceText || item.sourceEntryExcerpt || '').trim();
}

function sourceLinkLabel(item) {
  return item.sourceEntryId || item.sourceEntryExcerpt ? 'Open source entry' : 'View source day';
}

function trustText(item) {
  const parts = [];
  const unavailable = sourceStateLabel(item);
  if (unavailable) parts.push(unavailable);
  if (item.sourceText) parts.push('Detected from source text');
  else if (item.sourceEntryExcerpt) parts.push('Linked to source entry');
  else if (item.sourceEntryId) parts.push('Linked to source entry');
  if (item.sourceDate) parts.push(`from ${readableDate(item.sourceDate)}`);
  if (item.dueDate && item.kind === 'suggestedTask') parts.push(`would be due ${readableDate(item.dueDate)}`);
  return parts.join(' · ');
}

function isTypingTarget(target) {
  if (!target) return false;
  const tagName = String(target.tagName || '').toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable ||
    Boolean(target.closest?.('button, a, [role="button"]'))
  );
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
    ...(Array.isArray(item.changes)
      ? item.changes.flatMap((change) => [
          change.action,
          change.date,
          change.previous?.date,
          change.title,
        ])
      : []),
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}

function actionLabels(kind) {
  if (kind === 'scheduleSuggestion') return { primary: 'Accept selected', secondary: 'Reject all' };
  if (kind === 'ripple') return { primary: 'Approve', secondary: 'Dismiss' };
  if (kind === 'calendarAppointment' || kind === 'calendarEvent') return { primary: 'Keep', secondary: 'Dismiss' };
  return { primary: 'Accept', secondary: 'Reject' };
}

function outcomeDescription(kind) {
  if (kind === 'suggestedTask') return 'Accepting creates a task; you can adjust its title and due date first.';
  if (kind === 'suggestedGatherItem') return 'Accepting adds this to the named Gather list.';
  if (kind === 'suggestedInterest') return 'Accepting saves this as an interest to explore later.';
  if (kind === 'ripple') return 'Approving keeps this Ripple connected to its source entry.';
  if (kind === 'calendarAppointment') return 'Keeping makes this appointment visible on your calendar.';
  if (kind === 'calendarEvent') return 'Keeping makes this important date visible on your calendar.';
  if (kind === 'scheduleSuggestion') return 'Review every addition, removal, and change before updating your calendar.';
  return '';
}

function outcomeLabel(kind, action) {
  if (action === 'secondary') return kind === 'suggestedTask' || kind === 'suggestedGatherItem' || kind === 'suggestedInterest' || kind === 'scheduleSuggestion'
    ? 'Rejected'
    : 'Dismissed';
  if (kind === 'ripple') return 'Approved';
  if (kind === 'calendarAppointment' || kind === 'calendarEvent') return 'Kept';
  if (kind === 'scheduleSuggestion') return 'Schedule updated';
  return 'Accepted';
}

function editableSuggestion(kind) {
  return kind === 'suggestedTask' || kind === 'suggestedGatherItem' || kind === 'suggestedInterest';
}

function calendarItem(kind) {
  return kind === 'calendarAppointment' || kind === 'calendarEvent' || kind === 'scheduleSuggestion';
}

function suggestionPayload(item, draft = {}) {
  const payload = {};
  const title = suggestionTitle(item, draft);
  if (title && title !== item.title) payload.title = title;

  if (item.kind === 'suggestedTask') {
    const dueDate = String(draft.dueDate ?? item.dueDate ?? '').trim();
    if (Object.prototype.hasOwnProperty.call(draft, 'dueDate')) {
      payload.dueDate = dueDate || null;
    }
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

function acceptedTaskFollowup(result, todayISO) {
  const task = result?.task || result?.data?.task;
  const dueDate = task?.dueDate || '';
  const taskId = task?._id || task?.id || '';
  const destination = dueDate ? `/day/${dueDate}` : '/inbox/tasks';

  return {
    label: dueDate ? 'Open due day' : 'Open task inbox',
    to: destination,
    detail: dueDate ? `Task created for ${readableDate(dueDate)}.` : 'Task created without a due date.',
    kind: 'task',
    taskId,
    taskDueDate: dueDate,
    canMoveToday: Boolean(taskId && dueDate !== todayISO),
  };
}

function acceptedTarget(item, result) {
  if (item.kind === 'suggestedTask') {
    return acceptedTaskFollowup(result, todayISOInToronto());
  }
  if (item.kind === 'suggestedGatherItem') return { label: 'Open gather lists', to: '/gather-lists' };
  if (item.kind === 'suggestedInterest') return { label: 'Open interests', to: '/interests' };
  if (item.kind === 'ripple') return { label: 'Open ripples', to: '/ripples' };
  if (item.kind === 'scheduleSuggestion') {
    return {
      label: 'View week in Calendar',
      to: result?.data?.calendarPath || `/calendar?from=${item.periodStart}&to=${item.periodEnd}`,
      detail: 'Selected schedule changes were applied.',
    };
  }
  if (calendarItem(item.kind)) return { label: 'Open day', to: item.date ? `/day/${item.date}` : '/calendar' };
  return null;
}

function readableTime(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) return value || '';
  const [hour, minute] = value.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function scheduleRangeLabel(item) {
  const start = readableDate(item.periodStart);
  const end = readableDate(item.periodEnd);
  if (!start) return item.title || 'Work schedule';
  return `${item.label || 'Work'} schedule for ${start}${end && end !== start ? `–${end}` : ''}`;
}

function scheduleActionLabel(action) {
  if (action === 'remove') return 'Remove this shift';
  if (action === 'change') return 'Change this shift';
  if (action === 'move') return 'Move this shift';
  return 'Add this shift';
}

function ScheduleReviewItem({
  item,
  changes,
  busy,
  focused,
  selected,
  confirmDismiss,
  onFocus,
  onToggleItem,
  onChange,
  onAccept,
  onReject,
  onCancelReject,
}) {
  const selectedCount = changes.filter((change) => change.selected).length;
  const sourcePath = sourceEntryPath(item);

  function patchChange(key, patch) {
    onChange(changes.map((change) => change.key === key ? { ...change, ...patch } : change));
  }

  function chooseCandidate(change, targetAppointmentId) {
    const candidate = (change.candidateAppointments || []).find(
      (option) => String(option.id) === String(targetAppointmentId)
    );
    patchChange(change.key, {
      targetAppointmentId,
      previous: candidate ? {
        date: candidate.date,
        start: candidate.start,
        end: candidate.end,
      } : change.previous,
      selected: Boolean(targetAppointmentId),
    });
  }

  return (
    <article
      id={`review-item-${itemKey(item)}`}
      className={`review-inbox-item review-inbox-item--calendar schedule-review${selected ? ' is-selected' : ''}${focused ? ' is-focused' : ''}`}
      tabIndex={focused ? 0 : -1}
      data-review-key={itemKey(item)}
      onClick={onFocus}
      onFocus={onFocus}
    >
      <label className="review-inbox-item__select">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleItem}
          disabled={busy}
          aria-label={`Select ${item.title}`}
        />
      </label>
      <div className="review-inbox-item__body">
        <div className="review-inbox-item__kicker">
          <span>Schedule review</span>
          <span>{item.mode === 'replace' ? 'Replacement' : item.mode === 'update' ? 'Update' : 'New schedule'}</span>
        </div>
        <h2>{scheduleRangeLabel(item)}</h2>
        <p className="review-inbox-item__outcome">
          Review each calendar change. Only checked shifts will be applied.
        </p>
        {sourcePreview(item) && (
          <p className="review-source-preview">
            <span>Source entry</span>
            {sourcePreview(item)}
          </p>
        )}

        <div className="schedule-review__changes">
          {changes.map((change) => {
            const previous = change.previous || {};
            const destructive = ['remove', 'change', 'move'].includes(change.action);
            return (
              <fieldset key={change.key} className={`schedule-change schedule-change--${change.action}`}>
                <legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={change.selected !== false}
                      onChange={(event) => patchChange(change.key, { selected: event.target.checked })}
                      disabled={busy}
                    />
                    <span>{scheduleActionLabel(change.action)}</span>
                  </label>
                </legend>

                {destructive && (change.candidateAppointments || []).length > 1 && (
                  <label className="schedule-change__candidate">
                    <span>Which existing shift?</span>
                    <select
                      value={change.targetAppointmentId || ''}
                      onChange={(event) => chooseCandidate(change, event.target.value)}
                      disabled={busy}
                    >
                      <option value="">Choose a shift</option>
                      {change.candidateAppointments.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {readableDate(candidate.date)} · {readableTime(candidate.start)}–{readableTime(candidate.end)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {destructive && previous.date && (
                  <div className="schedule-change__previous">
                    <span>{change.action === 'remove' ? 'Existing shift' : 'From'}</span>
                    <strong>
                      {readableDate(previous.date)} · {readableTime(previous.start)}–{readableTime(previous.end)}
                    </strong>
                  </div>
                )}

                {change.action !== 'remove' && (
                  <div className="schedule-change__fields">
                    <label>
                      <span>Date</span>
                      <input
                        type="date"
                        value={change.date || ''}
                        onChange={(event) => patchChange(change.key, { date: event.target.value })}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      <span>Starts</span>
                      <input
                        type="time"
                        value={change.start || ''}
                        onChange={(event) => patchChange(change.key, { start: event.target.value })}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      <span>Ends</span>
                      <input
                        type="time"
                        value={change.end || ''}
                        onChange={(event) => patchChange(change.key, { end: event.target.value })}
                        disabled={busy}
                      />
                    </label>
                  </div>
                )}
                {change.action !== 'remove' && change.date && change.start && change.end && (
                  <p className="schedule-change__resolved">
                    {readableDate(change.date)} · {readableTime(change.start)}–{readableTime(change.end)}
                  </p>
                )}
                {(change.warnings || []).map((warning) => (
                  <p key={warning} className="schedule-change__warning">Check this: {warning}</p>
                ))}
              </fieldset>
            );
          })}
        </div>

        <div className="review-source-actions">
          <span className="review-source-actions__text">
            {selectedCount} of {changes.length} proposed {changes.length === 1 ? 'change' : 'changes'} selected
          </span>
          {sourcePath && (
            <Link to={sourcePath} className="review-button review-button--ghost review-button--compact">
              Open source entry
            </Link>
          )}
        </div>
      </div>
      <div className="review-inbox-item__actions schedule-review__actions">
        <button
          type="button"
          className="review-button review-button--primary"
          onClick={() => onAccept(changes)}
          disabled={busy || selectedCount === 0}
        >
          <Check size={16} aria-hidden="true" />
          Accept selected
        </button>
        <button
          type="button"
          className="review-button review-button--ghost"
          onClick={() => onAccept(changes.map((change) => ({ ...change, selected: true })))}
          disabled={busy}
        >
          Accept all
        </button>
        <button
          type="button"
          className="review-button review-button--danger"
          onClick={onReject}
          disabled={busy}
        >
          <X size={16} aria-hidden="true" />
          {confirmDismiss ? 'Confirm reject all' : 'Reject all'}
        </button>
        {confirmDismiss && (
          <button type="button" className="review-button review-button--ghost" onClick={onCancelReject} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </article>
  );
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
  const [focusedKey, setFocusedKey] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [followupBusyKeys, setFollowupBusyKeys] = useState(() => new Set());
  const loadSequenceRef = useRef(0);
  const mutationVersionRef = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    const mutationVersion = mutationVersionRef.current;
    setLoading(true);
    setError('');
    try {
      const data = await listReviewItems();
      if (sequence !== loadSequenceRef.current || mutationVersion !== mutationVersionRef.current) return;
      setItems(data.items);
      setCounts(data.counts);
    } catch (err) {
      if (sequence !== loadSequenceRef.current || mutationVersion !== mutationVersionRef.current) return;
      console.error('[ReviewInbox] load failed:', requestErrorSummary(err));
      setError(err?.response?.data?.error || 'Could not load the review inbox.');
      setItems([]);
      setCounts({});
    } finally {
      if (sequence === loadSequenceRef.current && mutationVersion === mutationVersionRef.current) {
        setLoading(false);
      }
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
  const focusedItem = useMemo(
    () => filteredItems.find((item) => itemKey(item) === focusedKey) || null,
    [filteredItems, focusedKey]
  );
  const focusedItemRef = useRef(null);
  const busyIdsRef = useRef(busyIds);
  const applyActionRef = useRef(null);
  const toggleSelectedRef = useRef(null);
  const keyboardNavigationRef = useRef(false);

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

  useEffect(() => {
    if (!filteredItems.length) {
      if (focusedKey) setFocusedKey('');
      return;
    }
    if (!filteredItems.some((item) => itemKey(item) === focusedKey)) {
      setFocusedKey(itemKey(filteredItems[0]));
    }
  }, [filteredItems, focusedKey]);

  useEffect(() => {
    if (!focusedKey) return;
    const element = document.getElementById(`review-item-${focusedKey}`);
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (keyboardNavigationRef.current) {
      element?.focus({ preventScroll: true });
      keyboardNavigationRef.current = false;
    }
  }, [focusedKey]);

  function setBusy(item, busy) {
    const key = itemKey(item);
    if (busy) busyIdsRef.current.add(key);
    else busyIdsRef.current.delete(key);
    setBusyIds(new Set(busyIdsRef.current));
  }

  function setItemsBusy(reviewItems, busy) {
    reviewItems.forEach((item) => {
      const key = itemKey(item);
      if (busy) busyIdsRef.current.add(key);
      else busyIdsRef.current.delete(key);
    });
    setBusyIds(new Set(busyIdsRef.current));
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

  const toggleSelected = useCallback((item) => {
    const key = itemKey(item);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setBulkConfirmAction('');
  }, []);

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

  const moveFocus = useCallback((delta) => {
    if (!filteredItems.length) return;
    const currentIndex = Math.max(0, filteredItems.findIndex((item) => itemKey(item) === focusedKey));
    const nextIndex = Math.min(filteredItems.length - 1, Math.max(0, currentIndex + delta));
    keyboardNavigationRef.current = true;
    setFocusedKey(itemKey(filteredItems[nextIndex]));
  }, [filteredItems, focusedKey]);

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

  async function moveAcceptedTaskToToday(completedItem) {
    if (!completedItem?.taskId) return;
    const todayISO = todayISOInToronto();
    const busyKey = completedItem.key;

    setFollowupBusyKeys((current) => new Set(current).add(busyKey));
    try {
      const { data: updatedTask } = await moveTaskToDate(completedItem.taskId, todayISO);
      const dueDate = updatedTask?.dueDate || todayISO;
      setCompletedItems((current) => current.map((item) => (
        item.key === busyKey
          ? {
              ...item,
              label: 'Open today',
              to: `/day/${dueDate}`,
              detail: 'Task moved to today.',
              taskDueDate: dueDate,
              canMoveToday: false,
            }
          : item
      )));
      showToast(`Moved "${completedItem.title}" to today.`, { type: 'success' });
    } catch (err) {
      console.error('[ReviewInbox] move accepted task failed:', err?.response?.data || err.message);
      showToast(err?.response?.data?.error || 'Could not move this task to today.', { type: 'error' });
    } finally {
      setFollowupBusyKeys((current) => {
        const next = new Set(current);
        next.delete(busyKey);
        return next;
      });
    }
  }

  async function performAction(item, action, draftOverride = null) {
    const id = item.id;
    if (!id) throw new Error('Review item is missing an id.');

    const draft = draftOverride || drafts[itemKey(item)] || {};
    if (action === 'primary' && editableSuggestion(item.kind) && !suggestionTitle(item, draft)) {
      throw new Error('Title is required before accepting this suggestion.');
    }

    if (item.kind === 'suggestedTask') {
      if (action === 'primary') return acceptSuggestedTask(id, suggestionPayload(item, draft));
      return rejectSuggestedTask(id);
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
      if (action === 'primary') return keepCalendarAppointment(id);
      return dismissCalendarAppointment(id);
    } else if (item.kind === 'calendarEvent') {
      if (action === 'primary') return keepCalendarEvent(id);
      return dismissCalendarEvent(id);
    } else if (item.kind === 'scheduleSuggestion') {
      if (action === 'primary') {
        return acceptScheduleSuggestion(id, draft.changes || item.changes || []);
      }
      return rejectScheduleSuggestion(id);
    }
    return null;
  }

  async function applyAction(item, action, draftOverride = null) {
    const key = itemKey(item);
    if (busyIdsRef.current.has(key)) return;
    if (action === 'secondary' && calendarItem(item.kind) && confirmingKey !== key) {
      setConfirmingKey(key);
      return;
    }

    setConfirmingKey('');
    setBusy(item, true);
    try {
      const result = await performAction(item, action, draftOverride);
      const removedIndex = filteredItems.findIndex((candidate) => itemKey(candidate) === key);
      const focusAfterRemoval = removedIndex >= 0
        ? filteredItems[removedIndex + 1] || filteredItems[removedIndex - 1] || null
        : null;
      mutationVersionRef.current += 1;
      loadSequenceRef.current += 1;
      setLoading(false);
      removeItem(item);
      if (focusAfterRemoval) {
        keyboardNavigationRef.current = true;
        setFocusedKey(itemKey(focusAfterRemoval));
      }
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
      console.error('[ReviewInbox] action failed:', requestErrorSummary(err));
      showToast(err?.response?.data?.error || err.message || 'Could not update this review item.', { type: 'error' });
    } finally {
      setBusy(item, false);
    }
  }

  async function applyBulkAction(action) {
    if (!selectedItems.length) return;
    if (selectedItems.some((item) => busyIdsRef.current.has(itemKey(item)))) return;
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

    if (succeeded.length) {
      mutationVersionRef.current += 1;
      loadSequenceRef.current += 1;
      setLoading(false);
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
        error: requestErrorSummary(err),
      })));
      showToast(`Could not update ${failed.length} selected item${failed.length === 1 ? '' : 's'}.`, { type: 'error' });
    }
  }

  useEffect(() => {
    focusedItemRef.current = focusedItem;
    busyIdsRef.current = busyIds;
    applyActionRef.current = applyAction;
    toggleSelectedRef.current = toggleSelected;
  });

  useEffect(() => {
    function onKeyDown(event) {
      if (isTypingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;

      const key = event.key;
      if (key === '?' || (key === '/' && event.shiftKey)) {
        event.preventDefault();
        setShowShortcuts((value) => !value);
        return;
      }
      if (!filteredItems.length) return;

      if (key === 'j' || key === 'ArrowDown') {
        event.preventDefault();
        moveFocus(1);
      } else if (key === 'k' || key === 'ArrowUp') {
        event.preventDefault();
        moveFocus(-1);
      } else if (key === 'x' && focusedItemRef.current) {
        event.preventDefault();
        toggleSelectedRef.current?.(focusedItemRef.current);
      } else if (key === 'a' && focusedItemRef.current && !busyIdsRef.current.has(itemKey(focusedItemRef.current))) {
        event.preventDefault();
        applyActionRef.current?.(focusedItemRef.current, 'primary');
      } else if (key === 'r' && focusedItemRef.current && !busyIdsRef.current.has(itemKey(focusedItemRef.current))) {
        event.preventDefault();
        applyActionRef.current?.(focusedItemRef.current, 'secondary');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filteredItems.length, moveFocus]);

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
          <button
            type="button"
            className="review-button review-button--ghost"
            onClick={() => setShowShortcuts((value) => !value)}
            aria-expanded={showShortcuts}
          >
            Shortcuts
          </button>
          <button type="button" className="review-button review-button--ghost" onClick={load} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            {loading ? 'Loading' : 'Refresh'}
          </button>
        </div>
      </header>

      {completedItems.length > 0 && (
        <section className="review-completed" aria-label="Recently accepted review items" aria-live="polite">
          {completedItems.map((item) => (
            <div key={item.key} className="review-completed__item">
              <div className="review-completed__summary">
                <span>{item.outcome} "{item.title}"</span>
                {item.detail && <small>{item.detail}</small>}
              </div>
              <div className="review-completed__actions">
                <Link to={item.to}>{item.label}</Link>
                {item.canMoveToday && (
                  <button
                    type="button"
                    className="review-button review-button--ghost review-button--compact"
                    onClick={() => moveAcceptedTaskToToday(item)}
                    disabled={followupBusyKeys.has(item.key)}
                  >
                    {followupBusyKeys.has(item.key) ? 'Moving' : 'Move to today'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {showShortcuts && (
        <section className="review-shortcuts" aria-label="Review Inbox keyboard shortcuts">
          <span><kbd>j</kbd>/<kbd>↓</kbd> next</span>
          <span><kbd>k</kbd>/<kbd>↑</kbd> previous</span>
          <span><kbd>x</kbd> select</span>
          <span><kbd>a</kbd> accept or keep</span>
          <span><kbd>r</kbd> reject or dismiss</span>
          <span><kbd>?</kbd> hide help</span>
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
      </section>
      <SecondarySection
        summary="Filter or work in bulk"
        hint={selectedCount ? `${selectedCount} selected` : `${visibleCount} showing`}
        className="review-inbox__secondary-tools"
      >
        <div className="review-inbox__tabs" aria-label="Review groups">
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
                aria-pressed={active}
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
      </SecondarySection>

      {loading && <div className="review-empty" role="status">Loading review items...</div>}
      {!loading && error && <div className="alert error" role="alert">{error}</div>}
      {!loading && !error && visibleCount === 0 && (
        <CalmEmptyState title={totalCount ? 'Nothing matches this view' : 'You’re caught up'}>
          {totalCount
            ? 'Try another filter or clear your search.'
            : 'When the Stream notices a useful task, idea, Ripple, or date, it will wait here for your say.'}
        </CalmEmptyState>
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
            const sourcePath = sourceEntryPath(item);
            const confidenceText = trustText(item);
            const focused = focusedKey === key;

            if (item.kind === 'scheduleSuggestion') {
              const scheduleChanges = draft.changes || item.changes || [];
              return (
                <ScheduleReviewItem
                  key={key}
                  item={item}
                  changes={scheduleChanges}
                  busy={busy}
                  focused={focused}
                  selected={selected}
                  confirmDismiss={confirmDismiss}
                  onFocus={() => setFocusedKey(key)}
                  onToggleItem={() => toggleSelected(item)}
                  onChange={(changes) => updateDraft(item, 'changes', changes)}
                  onAccept={(changes) => applyAction(item, 'primary', { changes })}
                  onReject={() => applyAction(item, 'secondary')}
                  onCancelReject={() => setConfirmingKey('')}
                />
              );
            }

            return (
              <article
                key={key}
                id={`review-item-${key}`}
                className={`review-inbox-item review-inbox-item--${item.group}${selected ? ' is-selected' : ''}${focused ? ' is-focused' : ''}`}
                tabIndex={focused ? 0 : -1}
                data-review-key={key}
                onClick={() => setFocusedKey(key)}
                onFocus={() => setFocusedKey(key)}
              >
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
                    {date && <span>{readableDate(date)}</span>}
                  </div>
                  <p className="review-inbox-item__outcome">{outcomeDescription(item.kind)}</p>
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
                  {(confidenceText || sourcePath) && (
                    <div className="review-source-actions">
                      {confidenceText && <span className="review-source-actions__text">{confidenceText}</span>}
                      {sourcePath && (
                        <Link to={sourcePath} className="review-button review-button--ghost review-button--compact">
                          {sourceLinkLabel(item)}
                        </Link>
                      )}
                    </div>
                  )}
                  <div className="review-inbox-item__meta">
                    {Array.isArray(item.meta) && item.meta.map((meta) => (
                      <span key={meta} className="review-pill">{meta}</span>
                    ))}
                    {source && item.sourceDate && (!item.sourceState || item.sourceState === 'active') ? (
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
