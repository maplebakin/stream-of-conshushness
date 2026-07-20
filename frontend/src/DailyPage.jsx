// frontend/src/DailyPage.jsx
import React, { useEffect, useMemo, useState, useContext, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import { listSuggestedGatherItems } from './api/suggestedGatherItems.js';
import { listSuggestedInterests } from './api/suggestedInterests.js';
import { getCalendarDay } from './api/calendar.js';

import TaskList from './TaskList.jsx';
import EntryQuickAssign from './adapters/EntryQuickAssign.default.jsx';
import AnalyzeEntryButton from './adapters/AnalyzeEntryButton.default.jsx';
import EntryModal from './EntryModal.jsx';
import AppointmentModal from './AppointmentModal.jsx';
import {
  getAppointmentDeleteConfirmation,
  getAppointmentDetailParts,
  getStoredAppointmentId,
} from './utils/appointmentIds.js';

import DailyRipples from './DailyRipples.jsx';
import HourlySchedule from './HourlySchedule.jsx';
import NotesSection from './NotesSection.jsx';

import { renderSafe } from './utils/safeRender.js';
import { toDisplayDate, todayISOInToronto, formatHM as formatHMUtil } from './utils/date.js';
import { toDisplay } from './utils/display.js';
import { isClustered } from './utils/isClustered.js';
import { useReviewCount } from './hooks/useReviewCount.js';
import { sourceEntryPath, sourceStateLabel } from './utils/sourceEntryState.js';
import { carryOverdueTasks, dailyPreferenceKey } from './utils/carryForward.js';
import { requestErrorSummary } from './utils/requestError.js';
import { chooseTodayFocus } from './utils/todayFocus.js';
import { CompactActionSummary, SecondarySection } from './components/UXPrimitives.jsx';

import './Main.css';
import './dailypage.css';

/* ---------- Toronto-safe date helpers ---------- */
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const formatHM = formatHMUtil;

/* ---------- entry helpers ---------- */
function isoFromDateLike(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
function entryDateISO(en) {
  return en?.date || en?.dateISO || isoFromDateLike(en?.createdAt) || '';
}
function stripHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}
function entryHasMeaningfulText(en) {
  const t = typeof en?.text === 'string' ? en.text : '';
  const c = typeof en?.content === 'string' ? en.content : '';
  const plain = (t || stripHtml(c)).replace(/\s+/g, ' ').trim();
  return plain.length > 0;
}

function eventAliasKey(item) {
  const id = item?._id || item?.id;
  if (id) return String(id);
  return `${item?.date || ''}|${item?.title || ''}`;
}

function calendarOriginLabel(item) {
  if (item?.source === 'entry-automation') return 'Automation';
  if (item?.source === 'user-edited') return 'Edited';
  return 'Manual';
}

function calendarSourceText(item) {
  const unavailable = sourceStateLabel(item);
  if (unavailable) return unavailable;
  if (item?.sourceDate) return `From entry on ${item.sourceDate}`;
  if (item?.sourceEntryId) return 'Created from Stream entry';
  if (item?.source === 'entry-automation') return 'Created from Stream entry';
  if (item?.source === 'user-edited') return 'Edited after creation';
  return '';
}

function minutesFromHHMM(value) {
  if (!value) return null;
  const [hour, minute = '0'] = String(value).split(':');
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h * 60) + m;
}

function currentTorontoMinutes() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  return (hour * 60) + minute;
}

function chooseNextTimelineItem(timeline, dateISO, todayISO) {
  if (!timeline.length) return null;
  if (dateISO !== todayISO) return timeline[0];

  const nowMinutes = currentTorontoMinutes();
  return (
    timeline.find((item) => {
      const itemMinutes = minutesFromHHMM(item.time);
      return itemMinutes !== null && itemMinutes >= nowMinutes;
    }) ||
    timeline.find((item) => !item.time) ||
    timeline[0]
  );
}

/* ===================================================== */
export default function DailyPage() {
  const location = useLocation();
  const { date: routeDate } = useParams();
  const navigate = useNavigate();
  const { token, user } = useContext(AuthContext);
  const preferenceOwnerId = String(user?.userId || user?._id || user?.id || '').trim();
  const autoCarryPreferenceKey = dailyPreferenceKey(preferenceOwnerId, 'auto-carry');
  const carryRunPreferenceKey = dailyPreferenceKey(preferenceOwnerId, 'carry-last-run');
  const schedulePreferenceKey = dailyPreferenceKey(preferenceOwnerId, 'show-schedule');
  const entryFilterPreferenceKey = dailyPreferenceKey(preferenceOwnerId, 'entries-unassigned-only');

  const todayISO = useMemo(() => todayISOInToronto(), []);
  const [dateISO, setDateISO] = useState(routeDate || todayISO);

  const [taskListKey, setTaskListKey] = useState(0);
  const [rippleListKey, setRippleListKey] = useState(0);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [showApptModal, setShowApptModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [confirmingAppointmentDeleteId, setConfirmingAppointmentDeleteId] = useState('');
  const [confirmingAppointmentDeleteMessage, setConfirmingAppointmentDeleteMessage] = useState('');
  const [autoCarry, setAutoCarry] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const [appointments, setAppointments] = useState([]);
  const [events,       setEvents]       = useState([]);
  const [important,    setImportant]    = useState([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [agendaError, setAgendaError] = useState('');
  const [deletingAppointmentId, setDeletingAppointmentId] = useState('');
  const [otherSuggestionCounts, setOtherSuggestionCounts] = useState({ gather: 0, interests: 0 });
  const [loadingOtherSuggestions, setLoadingOtherSuggestions] = useState(false);
  const [otherSuggestionsError, setOtherSuggestionsError] = useState('');
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const [taskAttentionRefreshKey, setTaskAttentionRefreshKey] = useState(0);
  const [taskAttention, setTaskAttention] = useState({ dueToday: [], onYourRadar: [] });
  const [loadingTaskAttention, setLoadingTaskAttention] = useState(false);
  const [taskAttentionError, setTaskAttentionError] = useState('');
  const reviewCount = useReviewCount(Boolean(token), reviewRefreshKey);
  const entriesLoadSequenceRef = useRef(0);
  const suggestionLoadSequenceRef = useRef(0);
  const taskLoadSequenceRef = useRef(0);
  const agendaLoadSequenceRef = useRef(0);

  useEffect(() => {
    if (!preferenceOwnerId) {
      setAutoCarry(false);
      setShowSchedule(false);
      setUnassignedOnly(false);
      return;
    }

    setAutoCarry(localStorage.getItem(autoCarryPreferenceKey) === '1');
    setShowSchedule(localStorage.getItem(schedulePreferenceKey) === '1');
    setUnassignedOnly(localStorage.getItem(entryFilterPreferenceKey) === '1');
  }, [
    preferenceOwnerId,
    autoCarryPreferenceKey,
    schedulePreferenceKey,
    entryFilterPreferenceKey,
  ]);

  useEffect(() => {
    if (!routeDate) {
      navigate(`/day/${dateISO}`, { replace: true });
    } else {
      setDateISO(routeDate);
    }
  }, [routeDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoCarry) return;
    // State can briefly contain the previous account's preference during an
    // in-place account switch. The destructive action must also be authorized
    // by the currently authenticated account's own stored setting.
    if (!autoCarryPreferenceKey || localStorage.getItem(autoCarryPreferenceKey) !== '1') return;
    if (dateISO !== todayISO) return;
    if (!carryRunPreferenceKey) return;
    const last = localStorage.getItem(carryRunPreferenceKey);
    if (last === todayISO) return;

    carryOverdueTasks(axios, todayISO)
    .then(() => {
      localStorage.setItem(carryRunPreferenceKey, todayISO);
      setTaskListKey(k => k + 1);
      setTaskAttentionRefreshKey(k => k + 1);
    })
    .catch(() => {});
  }, [autoCarry, autoCarryPreferenceKey, carryRunPreferenceKey, dateISO, todayISO, token]);

  useEffect(() => {
    if (loadingEntries || !location.hash.startsWith('#entry-')) return undefined;
    let targetId = location.hash.slice(1);
    try {
      targetId = decodeURIComponent(targetId);
    } catch {
      // Keep the raw fragment when it is not percent-encoded correctly.
    }
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [entries, loadingEntries, location.hash]);

  const go = (offsetDays) => {
    const d = new Date(dateISO + 'T00:00:00');
    d.setDate(d.getDate() + offsetDays);
    navigate(`/day/${toISO(d)}`);
  };

  async function carryForwardNow() {
    try {
      await carryOverdueTasks(axios, todayISO);
      setTaskListKey(k => k + 1);
      setTaskAttentionRefreshKey(k => k + 1);
    } catch (e) {
      console.error('carry-forward failed', requestErrorSummary(e));
    }
  }

  const loadEntries = useCallback(async () => {
    const sequence = ++entriesLoadSequenceRef.current;
    if (!token || !dateISO) {
      setEntries([]);
      setLoadingEntries(false);
      return;
    }
    setLoadingEntries(true);
    try {
      const res = await axios.get(`/api/entries/by-date/${dateISO}`);
      if (sequence !== entriesLoadSequenceRef.current) return;
      let list = Array.isArray(res.data) ? res.data : [];
      list = list.filter(e => entryDateISO(e) === dateISO);
      list = list.filter(entryHasMeaningfulText);
      if (unassignedOnly) list = list.filter(entry => !isClustered(entry));
      setEntries(list);
    } catch (err) {
      if (sequence !== entriesLoadSequenceRef.current) return;
      console.error('loadEntries error', requestErrorSummary(err));
      setEntries([]);
    } finally {
      if (sequence === entriesLoadSequenceRef.current) setLoadingEntries(false);
    }
  }, [token, dateISO, unassignedOnly]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const loadOtherSuggestionCounts = useCallback(async () => {
    const sequence = ++suggestionLoadSequenceRef.current;
    if (!token || !dateISO) {
      setOtherSuggestionCounts({ gather: 0, interests: 0 });
      setLoadingOtherSuggestions(false);
      return;
    }
    setLoadingOtherSuggestions(true);
    setOtherSuggestionsError('');
    try {
      const [gatherSuggestions, interestSuggestions] = await Promise.all([
        listSuggestedGatherItems({ date: dateISO }),
        listSuggestedInterests({ date: dateISO }),
      ]);
      if (sequence !== suggestionLoadSequenceRef.current) return;
      setOtherSuggestionCounts({
        gather: gatherSuggestions.length,
        interests: interestSuggestions.length,
      });
    } catch (err) {
      if (sequence !== suggestionLoadSequenceRef.current) return;
      console.error('load suggestion counts error', requestErrorSummary(err));
      setOtherSuggestionCounts({ gather: 0, interests: 0 });
      setOtherSuggestionsError('Could not load suggestion counts.');
    } finally {
      if (sequence === suggestionLoadSequenceRef.current) setLoadingOtherSuggestions(false);
    }
  }, [token, dateISO]);

  useEffect(() => { loadOtherSuggestionCounts(); }, [loadOtherSuggestionCounts]);

  const loadTaskAttention = useCallback(async () => {
    const sequence = ++taskLoadSequenceRef.current;
    if (!token || !dateISO) {
      setTaskAttention({ dueToday: [], onYourRadar: [] });
      setLoadingTaskAttention(false);
      return;
    }
    setLoadingTaskAttention(true);
    setTaskAttentionError('');
    try {
      const { data } = await axios.get(`/api/tasks/day/${dateISO}`);
      if (sequence !== taskLoadSequenceRef.current) return;
      setTaskAttention({
        dueToday: Array.isArray(data?.dueToday) ? data.dueToday : [],
        onYourRadar: Array.isArray(data?.onYourRadar) ? data.onYourRadar : [],
      });
    } catch (err) {
      if (sequence !== taskLoadSequenceRef.current) return;
      console.error('loadTaskAttention error', requestErrorSummary(err));
      setTaskAttention({ dueToday: [], onYourRadar: [] });
      setTaskAttentionError('Could not load task summary.');
    } finally {
      if (sequence === taskLoadSequenceRef.current) setLoadingTaskAttention(false);
    }
  }, [token, dateISO]);

  useEffect(() => { loadTaskAttention(); }, [loadTaskAttention, taskAttentionRefreshKey]);

  function handleEntryUpdated(updated) {
    const stillToday = entryDateISO(updated) === dateISO && entryHasMeaningfulText(updated);
    setEntries(prev => {
      const next = prev.map(e => e._id === updated._id ? updated : e);
      if (!stillToday) {
        return next.filter(e => e._id !== updated._id);
      }
      if (unassignedOnly && isClustered(updated)) {
        return next.filter(e => e._id !== updated._id);
      }
      return next;
    });
  }
  function handleTaskCreated() {
    setTaskListKey(k => k + 1);
    setTaskAttentionRefreshKey(k => k + 1);
  }
  const handleTasksChanged = useCallback(() => {
    setTaskListKey(k => k + 1);
    setTaskAttentionRefreshKey(k => k + 1);
  }, []);

  const loadAgenda = useCallback(async () => {
    const sequence = ++agendaLoadSequenceRef.current;
    if (!token || !dateISO) {
      setAppointments([]); setEvents([]); setImportant([]);
      setAgendaError('');
      setLoadingAgenda(false);
      return;
    }
    setLoadingAgenda(true);
    setAgendaError('');
    try {
      const data = await getCalendarDay(dateISO);
      if (sequence !== agendaLoadSequenceRef.current) return;
      setAppointments(data.appointments);
      setEvents(data.events);
      setImportant(data.importantEvents);
    } catch (err) {
      if (sequence !== agendaLoadSequenceRef.current) return;
      console.error('loadAgenda error', requestErrorSummary(err));
      setAppointments([]); setEvents([]); setImportant([]);
      setAgendaError(err?.response?.data?.error || err?.message || 'Could not load appointments and events.');
    } finally {
      if (sequence === agendaLoadSequenceRef.current) setLoadingAgenda(false);
    }
  }, [token, dateISO]);

  useEffect(() => { loadAgenda(); }, [loadAgenda]);

  const timeline = useMemo(() => {
    const appts = (appointments || []).map(a => ({
      ...a,
      _id: a._id,
      type: 'appointment',
      title: a.title || '(untitled)',
      date: a.date,
      time: a.timeStart || null,
      timeEnd: a.timeEnd || null,
      location: a.location || '',
      details: a.details || '',
      source: a.source || '',
      sourceEntryId: a.sourceEntryId || '',
      sourceDate: a.sourceDate || '',
      sourceTitle: a.sourceTitle || '',
      sourceState: a.sourceState || '',
    }));
    const importantKeys = new Set((important || []).map(eventAliasKey));
    const evs = (events || [])
      .filter(e => !importantKeys.has(eventAliasKey(e)))
      .map(e => ({
        _id: e._id,
        type: 'event',
        title: e.title || '(untitled)',
        date: e.date,
        time: null,
        pinned: !!e.pinned,
        source: e.source || '',
        sourceEntryId: e.sourceEntryId || '',
        sourceDate: e.sourceDate || '',
        sourceTitle: e.sourceTitle || '',
        sourceState: e.sourceState || '',
      }));
    const imps = (important || []).map(e => ({
      _id: e._id,
      type: 'important',
      title: e.title || '(untitled)',
      date: e.date,
      time: null,
      note: e.details || e.description || '',
      source: e.source || '',
      sourceEntryId: e.sourceEntryId || '',
      sourceDate: e.sourceDate || '',
      sourceTitle: e.sourceTitle || '',
      sourceState: e.sourceState || '',
    }));
    const seen = new Set();
    const all = [...appts, ...imps, ...evs].filter((item) => {
      const key = item.type === 'appointment'
        ? `${item.type}:${item._id || item.id || `${item.date}|${item.time}|${item.title}`}`
        : eventAliasKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    all.sort((a, b) => {
      const ta = a.time ? a.time : '24:00';
      const tb = b.time ? b.time : '24:00';
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return (a.title || '').localeCompare(b.title || '');
    });
    return all;
  }, [appointments, events, important]);

  const attentionSummary = useMemo(() => {
    const dueTasks = Array.isArray(taskAttention.dueToday) ? taskAttention.dueToday : [];
    const earlierTasks = dueTasks.filter(task => task?.dueDate && task.dueDate < dateISO);
    const todayTasks = dueTasks.filter(task => task?.dueDate === dateISO);
    const nextTimelineItem = chooseNextTimelineItem(timeline, dateISO, todayISO);

    return {
      earlierTasks,
      todayTasks,
      nextTimelineItem,
      focus: chooseTodayFocus({
        nextScheduled: nextTimelineItem,
        todayTasks,
        earlierTasks,
        reviewCount: reviewCount.count,
      }),
    };
  }, [dateISO, reviewCount.count, taskAttention, timeline, todayISO]);

  const nowContent = useMemo(() => {
    if (loadingAgenda || loadingTaskAttention || reviewCount.loading) {
      return {
        label: 'Checking the day',
        primary: 'Finding your next thread…',
        description: '',
        action: null,
      };
    }

    const { focus } = attentionSummary;
    if (focus.kind === 'scheduled') {
      return {
        label: 'Next scheduled',
        primary: focus.item.title,
        description: focus.item.time ? formatHM(focus.item.time) : 'All day',
        action: <a href="#daily-agenda" className="button chip">View agenda</a>,
      };
    }
    if (focus.kind === 'today-task') {
      return {
        label: focus.count === 1 ? 'Task for today' : `${focus.count} tasks for today`,
        primary: focus.item?.title || `${focus.count} tasks need attention`,
        description: focus.count > 1 ? `${focus.count - 1} more waiting after this one` : '',
        action: <Link to={`/inbox/tasks/${dateISO}`} className="button chip">Review tasks</Link>,
      };
    }
    if (focus.kind === 'earlier-task') {
      return {
        label: 'Needs attention',
        primary: `${focus.count} earlier ${focus.count === 1 ? 'task needs' : 'tasks need'} attention`,
        description: focus.item?.title ? `First up: ${focus.item.title}` : '',
        action: <Link to="/inbox/tasks" className="button chip">Review {focus.count === 1 ? 'task' : 'tasks'}</Link>,
      };
    }
    if (focus.kind === 'review') {
      return {
        label: 'Ready to review',
        primary: `${focus.count} ${focus.count === 1 ? 'suggestion is' : 'suggestions are'} waiting`,
        description: 'Choose what should become part of your plans.',
        action: <Link to="/review" className="button chip">Review</Link>,
      };
    }
    return {
      label: 'Quiet day',
      primary: 'Nothing needs your attention right now',
      description: 'A good moment to catch a thought.',
      action: <button type="button" className="button chip" onClick={openNewEntry}>Capture thought</button>,
    };
  }, [attentionSummary, dateISO, loadingAgenda, loadingTaskAttention, reviewCount.loading]);

  const nowSecondary = useMemo(() => {
    if (loadingAgenda || loadingTaskAttention || reviewCount.loading) return null;
    const items = [];
    const isScheduledFocus = attentionSummary.focus.kind === 'scheduled';
    const isTodayTaskFocus = attentionSummary.focus.kind === 'today-task';
    const isEarlierTaskFocus = attentionSummary.focus.kind === 'earlier-task';
    const isReviewFocus = attentionSummary.focus.kind === 'review';

    if (isScheduledFocus && attentionSummary.todayTasks.length > 0) {
      items.push(
        <Link key="today-tasks" to={`/inbox/tasks/${dateISO}`}>
          {attentionSummary.todayTasks.length} {attentionSummary.todayTasks.length === 1 ? 'task' : 'tasks'} today
        </Link>
      );
    }
    if (!isEarlierTaskFocus && attentionSummary.earlierTasks.length > 0) {
      items.push(
        <Link key="earlier-tasks" to="/inbox/tasks">
          {attentionSummary.earlierTasks.length} earlier
        </Link>
      );
    }
    if (!isReviewFocus && reviewCount.count > 0) {
      items.push(<Link key="review" to="/review">{reviewCount.count} to review</Link>);
    }
    if (
      attentionSummary.focus.kind !== 'quiet' &&
      !isScheduledFocus &&
      !attentionSummary.nextTimelineItem
    ) {
      items.push(<span key="schedule">Nothing scheduled next</span>);
    }
    if (isTodayTaskFocus && attentionSummary.earlierTasks.length === 0 && reviewCount.count === 0) {
      items.push(<span key="focus">One thing at a time</span>);
    }
    return items.length > 0 ? items : null;
  }, [attentionSummary, dateISO, loadingAgenda, loadingTaskAttention, reviewCount.count, reviewCount.loading]);

  function openNewAppointment() {
    setEditingAppointment(null);
    setConfirmingAppointmentDeleteId('');
    setConfirmingAppointmentDeleteMessage('');
    setShowApptModal(true);
  }

  function openNewEntry() {
    setEditingEntry(null);
    setShowEntryModal(true);
  }

  function openEditEntry(entry) {
    setEditingEntry(entry);
    setShowEntryModal(true);
  }

  function openEditAppointment(appointment) {
    setEditingAppointment(appointment);
    setConfirmingAppointmentDeleteId('');
    setConfirmingAppointmentDeleteMessage('');
    setShowApptModal(true);
  }

  async function deleteAppointment(appointment) {
    const id = getStoredAppointmentId(appointment);
    if (!id) return;
    const confirmationMessage = getAppointmentDeleteConfirmation(appointment);
    if (confirmingAppointmentDeleteId !== id) {
      setConfirmingAppointmentDeleteId(id);
      setConfirmingAppointmentDeleteMessage(confirmationMessage);
      return;
    }
    if (deletingAppointmentId) return;
    setDeletingAppointmentId(id);
    setAgendaError('');
    try {
      await axios.delete(`/api/appointments/${encodeURIComponent(id)}`);
      setConfirmingAppointmentDeleteId('');
      setConfirmingAppointmentDeleteMessage('');
      await loadAgenda();
    } catch (err) {
      console.error('delete appointment failed', requestErrorSummary(err));
      setAgendaError(err?.response?.data?.error || err?.message || 'Could not delete the appointment.');
    } finally {
      setDeletingAppointmentId('');
    }
  }

  return (
    <main className="daily-page">
      <header className="daily-header">
        <div className="centered-header">
          <button className="button nav-arrow" onClick={() => go(-1)} aria-label="Previous day">◀</button>
          <h2 className="font-echo text-2xl text-plum">{toDisplayDate(dateISO)}</h2>
          <button className="button nav-arrow" onClick={() => go(1)} aria-label="Next day">▶</button>

          {dateISO !== todayISO && (
            <button
              className="button today-btn"
              onClick={() => navigate(`/day/${todayISO}`)}
              title="Jump to today"
            >
              Today
            </button>
          )}

        </div>

        <div className="daily-actions">
          <button
            className="button rounded-button bg-lantern px-4 py-2 font-thread text-ink shadow-soft transition-all hover:bg-plum hover:text-mist"
            onClick={openNewEntry}
          >
            + Capture thought
          </button>
          <button
            className="button rounded-button bg-spool px-4 py-2 font-thread text-ink shadow-soft transition-all hover:bg-plum hover:text-mist"
            onClick={openNewAppointment}
          >
            + Add appointment
          </button>
          {dateISO === todayISO && (
            <details className="daily-options-menu">
              <summary aria-label="Day options" title="Day options">
                <span aria-hidden="true">⚙</span>
              </summary>
              <div className="daily-options-menu__panel">
                <strong>Day options</strong>
                <button
                  type="button"
                  className="button chip"
                  onClick={() => {
                    const next = !autoCarry;
                    setAutoCarry(next);
                    if (autoCarryPreferenceKey) localStorage.setItem(autoCarryPreferenceKey, next ? '1' : '0');
                  }}
                >
                  Automatic carry-forward: {autoCarry ? 'On' : 'Off'}
                </button>
                <button type="button" className="button chip" onClick={carryForwardNow}>
                  Carry earlier tasks to today now
                </button>
              </div>
            </details>
          )}
        </div>
      </header>

      <CompactActionSummary
        className="daily-attention"
        eyebrow="Now"
        title="What matters next?"
        label={nowContent.label}
        primary={nowContent.primary}
        description={nowContent.description}
        action={nowContent.action}
        secondary={nowSecondary}
      />
      {(reviewCount.error || taskAttentionError) && (
        <p className="daily-attention__note muted" role="status">
          {[reviewCount.error, taskAttentionError].filter(Boolean).join(' ')}
        </p>
      )}

      <section className="daily-layout">
        <div className="daily-main">
          <div className="panel daily-task-panel">
            <h3 className="daily-section-heading">Due Today</h3>
            {renderSafe(
              TaskList,
              {
                key: `due-${taskListKey}`,
                date: dateISO,
                bucket: 'dueToday',
                header: null,
                keepCompleted: false,
                onTasksChanged: handleTasksChanged,
              },
              'TaskList'
            )}
            <SecondarySection summary="On your radar" hint="A few relevant tasks">
              {renderSafe(
                TaskList,
                {
                  key: `radar-${taskListKey}`,
                  date: dateISO,
                  bucket: 'onYourRadar',
                  header: null,
                  keepCompleted: false,
                  onTasksChanged: handleTasksChanged,
                },
                'TaskList'
              )}
            </SecondarySection>
            <SecondarySection
              summary="Review details"
              hint={reviewCount.count > 0 ? `${reviewCount.count} waiting` : 'No action needed'}
            >
              <div className="daily-suggestions">
              <div className="side-header">
                <h3 className="daily-section-heading">Suggested Tasks</h3>
                <div className="daily-review-actions">
                  <Link className="button chip" to="/review">
                    Review Inbox{reviewCount.count > 0 ? ` (${reviewCount.count})` : ''}
                  </Link>
                  <Link className="button chip" to={`/inbox/tasks/${dateISO}`}>Task inbox</Link>
                </div>
              </div>
              <p className="muted">
                Review, edit, accept, or dismiss entry inferences in one place before they become tasks.
              </p>
              <div className="suggestion-links">
                <Link to="/gather-lists">Gather suggestions</Link>
                <Link to="/interests">Interest suggestions</Link>
              </div>
              <div className="other-suggestions" aria-live="polite">
                <div className="other-suggestions__header">
                  <span>Other Suggestions</span>
                  {loadingOtherSuggestions && <span className="muted">Loading...</span>}
                </div>
                {otherSuggestionsError && <div className="muted">{otherSuggestionsError}</div>}
                {!otherSuggestionsError && (
                  <div className="other-suggestions__grid">
                    <Link to="/gather-lists" className="other-suggestions__item">
                      <strong>{otherSuggestionCounts.gather}</strong>
                      <span>Gather items</span>
                    </Link>
                    <Link to="/interests" className="other-suggestions__item">
                      <strong>{otherSuggestionCounts.interests}</strong>
                      <span>Interests</span>
                    </Link>
                  </div>
                )}
              </div>
              </div>
              <DailyRipples key={rippleListKey} date={dateISO} />
            </SecondarySection>
          </div>

          <div className="panel">
            <div className="entries-header">
              <h3 className="font-thread text-vein">Today’s Entries</h3>
              <button
                className="button chip"
                onClick={() => {
                  const next = !unassignedOnly;
                  setUnassignedOnly(next);
                  if (entryFilterPreferenceKey) {
                    localStorage.setItem(entryFilterPreferenceKey, next ? '1' : '0');
                  }
                  setEntries(prev => next
                    ? prev.filter(e => !isClustered(e))
                    : prev
                  );
                }}
                title="Show only entries without a cluster"
              >
                {unassignedOnly ? 'Showing: Unassigned' : 'Showing: All'}
              </button>
            </div>

            {loadingEntries && <p className="muted">Loading entries...</p>}
            {!loadingEntries && entries.length === 0 && (
              <p className="muted">{unassignedOnly ? 'No unassigned entries 🎉' : 'No entries yet.'}</p>
            )}

            {entries.map(en => {
              const safeText =
                toDisplay(en?.text ?? en?.content ?? '') || <span className="muted">(no text)</span>;
              return (
                <div key={en._id} id={`entry-${en._id}`} className="entry-card" tabIndex={-1}>
                  <div className="entry-text">{safeText}</div>
                  <div className="entry-actions-row">
                    <button
                      type="button"
                      className="button chip"
                      onClick={() => openEditEntry(en)}
                      aria-label={`Edit entry from ${en.date || dateISO}`}
                    >
                      Edit entry
                    </button>
                    {renderSafe(EntryQuickAssign, {
                      entry: en,
                      onUpdated: handleEntryUpdated,
                      onTaskCreated: handleTaskCreated
                    }, 'EntryQuickAssign')}

                    {renderSafe(AnalyzeEntryButton, {
                      entryId: en._id,
                      text: (typeof en?.text === 'string' ? en.text : ''),
                      date: (en.date || en.dateISO || dateISO),
                      onRipples: () => setRippleListKey(k => k + 1)
                    }, 'AnalyzeEntryButton')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="daily-side">
          <div className="panel" id="daily-agenda">
            <div className="side-header">
              <h3 className="font-thread text-vein">Appointments & Events</h3>
              <div className="side-header__actions">
                <button type="button" className="button chip" onClick={loadAgenda} title="Refresh agenda" disabled={loadingAgenda}>Refresh</button>
              </div>
            </div>

            {loadingAgenda && <p className="muted">Loading…</p>}
            {!loadingAgenda && agendaError && (
              <div className="alert error" role="alert">
                {agendaError}{' '}
                <button type="button" className="button chip" onClick={loadAgenda}>Retry</button>
              </div>
            )}
            {!loadingAgenda && !agendaError && timeline.length === 0 && (
              <p className="muted">Nothing scheduled or logged for this day.</p>
            )}

            {!loadingAgenda && !agendaError && timeline.length > 0 && (
              <ul className="agenda-list">
                {timeline.map(item => {
                  const appointmentDetails = item.type === 'appointment'
                    ? getAppointmentDetailParts(item, formatHM)
                    : [];
                  const appointmentDeleteId = item.type === 'appointment' ? getStoredAppointmentId(item) : '';
                  const confirmingDelete = appointmentDeleteId && confirmingAppointmentDeleteId === appointmentDeleteId;
                  const deleting = appointmentDeleteId && deletingAppointmentId === appointmentDeleteId;
                  const sourcePath = sourceEntryPath(item);
                  const sourceText = calendarSourceText(item);

                  return (
                    <li key={`${item.type}-${item._id}`} className="agenda-item">
                      <span className="agenda-bullet" aria-hidden="true">
                        {item.type === 'appointment' ? '🗓️' : item.type === 'important' ? '⭐' : '📌'}
                      </span>
                      <div className="agenda-main">
                        <div className="agenda-title">
                          {item.title}
                          {item.type === 'important' && <span className="agenda-type-label muted">(Important)</span>}
                        </div>
                        <div className="agenda-meta muted">
                          {item.type === 'appointment' ? appointmentDetails.join(' · ') : 'All day'}
                        </div>
                        {item.type === 'appointment' && item.details && (
                          <div className="agenda-meta agenda-details muted">
                            {item.details}
                          </div>
                        )}
                        <div className="agenda-source">
                          <span className={`agenda-origin-pill agenda-origin-pill--${item.source || 'manual'}`}>
                            {calendarOriginLabel(item)}
                          </span>
                          {sourceText && <span className="agenda-source-text">{sourceText}</span>}
                          {sourcePath && (
                            <Link to={sourcePath} className="button chip agenda-source-link">
                              Open source entry
                            </Link>
                          )}
                        </div>
                        {item.type === 'appointment' && (
                          <div className="agenda-actions">
                            <button type="button" className="button chip" onClick={() => openEditAppointment(item)} title="Edit appointment" disabled={Boolean(deletingAppointmentId)}>Edit</button>
                            <button
                              type="button"
                              className="button chip"
                              onClick={() => deleteAppointment(item)}
                              title={confirmingDelete ? confirmingAppointmentDeleteMessage || 'Confirm delete appointment' : 'Delete appointment'}
                              disabled={Boolean(deletingAppointmentId)}
                            >
                              {deleting ? 'Deleting…' : confirmingDelete ? 'Confirm Delete' : 'Delete'}
                            </button>
                            {confirmingDelete && (
                              <button
                                type="button"
                                className="button chip"
                                onClick={() => {
                                  setConfirmingAppointmentDeleteId('');
                                  setConfirmingAppointmentDeleteMessage('');
                                }}
                                disabled={Boolean(deletingAppointmentId)}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <SecondarySection
            summary="Hourly schedule"
            hint="Optional planning grid"
            open={showSchedule}
            className="daily-schedule-disclosure"
            onToggle={(event) => {
              const next = event.currentTarget.open;
              setShowSchedule(next);
              if (schedulePreferenceKey) {
                localStorage.setItem(schedulePreferenceKey, next ? '1' : '0');
              }
            }}
          >
            <div className="hourly-schedule-wrap">
              <HourlySchedule date={dateISO} />
            </div>
          </SecondarySection>

        </aside>
      </section>

      <SecondarySection summary="Notes for this day" hint="Optional context">
        <NotesSection date={dateISO} />
      </SecondarySection>

      {showEntryModal &&
        renderSafe(EntryModal, {
          initialEntry: editingEntry,
          defaultDate: editingEntry?.date || dateISO,
          onClose: () => {
            setShowEntryModal(false);
            setEditingEntry(null);
          },
          onSaved: (updatedEntry) => {
            if (editingEntry) handleEntryUpdated(updatedEntry);
            setShowEntryModal(false);
            setEditingEntry(null);
            setTaskListKey(k => k + 1);
            loadEntries();
            loadAgenda();
            setTaskAttentionRefreshKey(k => k + 1);
            setReviewRefreshKey(k => k + 1);
            setRippleListKey(k => k + 1);
            loadOtherSuggestionCounts();
          },
          onAnalyzed: () => setRippleListKey(k => k + 1),
        }, 'EntryModal')
      }

      {showApptModal &&
        renderSafe(AppointmentModal, {
          defaultDate: dateISO,
          initialAppointment: editingAppointment,
          onClose: () => {
            setShowApptModal(false);
            setEditingAppointment(null);
            loadAgenda();
          },
          onSaved: () => {
            setShowApptModal(false);
            setEditingAppointment(null);
            loadAgenda();
          }
        }, 'AppointmentModal')
      }
    </main>
  );
}
