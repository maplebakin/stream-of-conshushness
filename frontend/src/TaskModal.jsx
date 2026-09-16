// src/TaskModal.jsx
import React, { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { normalizeClusterList } from './utils/clusterHelpers.js';
import { todayISOInToronto } from './utils/date.js';
import { requestErrorSummary } from './utils/requestError.js';
import { clearRequestId, stableRequestId } from './utils/idempotency.js';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Props:
 *   - isOpen: boolean
 *   - onClose: () => void
 *   - onSaved: () => void   // called after successful POST so caller can clean up (e.g., dismiss ripple)
 *   - defaultTitle?: string
 *   - defaultDueDate?: 'YYYY-MM-DD'
 *   - defaultCluster?: string
 */
export default function TaskModal({
  isOpen,
  onClose,
  onSaved,
  defaultTitle = '',
  defaultDueDate = todayISOInToronto(),
  defaultCluster = ''
}) {
  const { token } = useContext(AuthContext);
  const dialogRef = useRef(null);
  const titleInputRef = useRef(null);
  const previousFocusRef = useRef(null);
  const savingRef = useRef(false);
  const requestIdRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const errorId = useId();
  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const [title, setTitle] = useState(defaultTitle);
  const [dueDate, setDueDate] = useState(defaultDueDate || todayISOInToronto());
  const [cluster, setCluster] = useState(defaultCluster || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [clusters, setClusters] = useState([]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(defaultTitle);
    setDueDate(defaultDueDate || todayISOInToronto());
    setCluster(defaultCluster || '');
    setNote('');
    setErr('');
    clearRequestId(requestIdRef);
  }, [isOpen, defaultTitle, defaultDueDate, defaultCluster]);

  useEffect(() => {
    if (!isOpen || !token) return;
    let ignore = false;
    axios.get('/api/clusters', { headers })
      .then((res) => {
        if (!ignore) setClusters(normalizeClusterList(res));
      })
      .catch(() => {
        if (!ignore) setClusters([]);
      });
    return () => { ignore = true; };
  }, [isOpen, token, headers]);

  useEffect(() => {
    if (!isOpen) return undefined;

    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        if (savingRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      const focusable = Array.from(dialog?.querySelectorAll(FOCUSABLE_SELECTOR) || [])
        .filter((element) => element.getAttribute('aria-hidden') !== 'true');

      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown, true);
      document.documentElement.style.overflow = previousOverflow;
      const previousFocus = previousFocusRef.current;
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
        requestAnimationFrame(() => previousFocus.focus());
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function requestClose() {
    if (savingRef.current) return;
    onCloseRef.current?.();
  }

  async function saveTask(e) {
    e?.preventDefault?.();
    if (savingRef.current) return;
    if (!title.trim()) {
      setErr('Title is required.');
      titleInputRef.current?.focus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setErr('');
    try {
      // Minimal, schema-safe payload. Adjust keys only if your /api/tasks expects different names.
      const payload = {
        title: title.trim(),
        dueDate: dueDate || todayISOInToronto(),
        cluster: cluster || undefined,
        notes: note.trim() || undefined,
        status: 'todo'
      };
      const requestId = stableRequestId(requestIdRef, JSON.stringify(payload), 'task');

      // CREATE TASK — NOT an event
      const res = await axios.post('/api/tasks', payload, {
        headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': requestId }
      });
      clearRequestId(requestIdRef);

      // The task is durable at this point. A caller refresh/dismiss callback
      // must not turn that success into a retryable create error.
      try {
        Promise.resolve(onSaved?.(res.data)).catch((callbackError) => {
          console.error('Task saved but follow-up failed:', requestErrorSummary(callbackError));
        });
      } catch (callbackError) {
        console.error('Task saved but follow-up failed:', requestErrorSummary(callbackError));
      }
      try {
        onCloseRef.current?.();
      } catch (callbackError) {
        console.error('Task saved but dialog close failed:', requestErrorSummary(callbackError));
      }
    } catch (e) {
      console.error('Create task failed:', requestErrorSummary(e));
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        'Failed to create task.';
      setErr(String(msg));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={err ? errorId : undefined}
        aria-busy={saving}
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 text-zinc-900 shadow-2xl dark:bg-zinc-900 dark:text-zinc-100"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold">New Task</h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            aria-label="Close new task dialog"
            className="min-h-11 rounded bg-zinc-100 px-3 py-2 text-sm hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Close
          </button>
        </div>

        <form onSubmit={saveTask} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm" htmlFor={`${titleId}-title`}>Title</label>
            <input
              id={`${titleId}-title`}
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={saving}
              placeholder="e.g., Clean the fish tank"
              className="w-full rounded border bg-white px-3 py-2 dark:bg-zinc-900"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label className="mb-1 block text-sm" htmlFor={`${titleId}-due-date`}>Due date</label>
              <input
                id={`${titleId}-due-date`}
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                disabled={saving}
                className="w-full rounded border bg-white px-3 py-2 dark:bg-zinc-900"
              />
            </div>

            <div className="flex-1">
              <label className="mb-1 block text-sm" htmlFor={`${titleId}-cluster`}>Cluster (optional)</label>
              <select
                id={`${titleId}-cluster`}
                value={cluster}
                onChange={e => setCluster(e.target.value)}
                disabled={saving}
                className="w-full rounded border bg-white px-3 py-2 dark:bg-zinc-900"
              >
                <option value="">—</option>
                {clusters.map((c) => (
                  <option key={c.id || c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm" htmlFor={`${titleId}-note`}>Note (optional)</label>
            <textarea
              id={`${titleId}-note`}
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={saving}
              placeholder=""
              className="w-full rounded border bg-white px-3 py-2 dark:bg-zinc-900"
            />
          </div>

          {err && <div id={errorId} className="text-sm text-red-600" role="alert">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="min-h-11 rounded bg-zinc-100 px-3 py-2 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="min-h-11 rounded bg-green-600 px-3 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
