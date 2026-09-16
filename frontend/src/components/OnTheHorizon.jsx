import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/axiosInstance.js';
import { getAppointmentDetailParts, getStoredAppointmentId } from '../utils/appointmentIds.js';
import { sourceEntryPath, sourceStateLabel } from '../utils/sourceEntryState.js';

function itemIcon(type) {
  return type === 'appointment' ? '🗓️' : '⭐';
}

function itemTypeLabel(type) {
  return type === 'appointment' ? 'Appointment' : 'Important event';
}

function formatHorizonDate(item) {
  if (!item?.date) return '';
  const date = new Date(`${item.date}T12:00:00`);
  if (Number.isNaN(date.getTime())) return item.date;
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = item.time || item.timeStart;
  if (!time) return dateLabel;
  const [hour, minute = '00'] = String(time).split(':');
  const hourNumber = Number(hour);
  if (!Number.isFinite(hourNumber)) return `${dateLabel} · ${time}`;
  const suffix = hourNumber >= 12 ? 'PM' : 'AM';
  const displayHour = hourNumber % 12 || 12;
  return `${dateLabel} · ${displayHour}:${minute} ${suffix}`;
}

export default function OnTheHorizon({
  days = 60,
  limit,
  refreshKey = 0,
  onAddAppointment,
  onAddEvent,
  onEditAppointment,
  onDeleteAppointment,
  confirmingAppointmentDeleteId = '',
  confirmingAppointmentDeleteMessage = '',
  deletingAppointmentId = '',
  onCancelAppointmentDelete,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadHorizon() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (days) params.set('days', String(days));
        if (limit) params.set('limit', String(limit));
        const { data } = await axios.get(`/api/horizon?${params.toString()}`);
        if (!cancelled) {
          setItems(Array.isArray(data?.items) ? data.items : []);
          setExpanded(false);
        }
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setError(err?.response?.data?.error || err?.message || 'Unable to load horizon items.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHorizon();
    return () => {
      cancelled = true;
    };
  }, [days, limit, refreshKey]);

  return (
    <section className={`on-the-horizon${expanded ? ' is-expanded' : ''}`}>
      <header className="on-the-horizon__header">
        <h3 className="font-thread text-vein">On the Horizon</h3>
        <div className="on-the-horizon__add-actions">
          {onAddAppointment && (
            <button className="button chip" type="button" onClick={onAddAppointment} title="Add appointment">
              + Appointment
            </button>
          )}
          {onAddEvent && (
            <button className="button chip" type="button" onClick={onAddEvent} title="Add important event">
              + Event
            </button>
          )}
        </div>
      </header>

      {loading && <div className="muted">Loading horizon...</div>}
      {!loading && error && <div className="alert error">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="muted">Nothing on the horizon.</div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {items.map((item) => {
            const isAppointment = item.type === 'appointment';
            const detailParts = isAppointment ? getAppointmentDetailParts(item) : [];
            const appointmentDeleteId = isAppointment ? getStoredAppointmentId(item) : '';
            const confirmingDelete = appointmentDeleteId && confirmingAppointmentDeleteId === appointmentDeleteId;
            const deleting = appointmentDeleteId && deletingAppointmentId === appointmentDeleteId;
            const sourceState = sourceStateLabel(item);
            const sourcePath = sourceEntryPath(item);
            const sourceLabel = sourceState || (item.sourceEntryId ? 'From Stream' : 'Manual');
            const hasDetails = Boolean(item.sourceText || item.details || detailParts.length);
            return (
              <li
                key={`${item.type}-${item.id}`}
                className="task horizon-item"
              >
                <div className="horizon-item__main">
                  <span className="horizon-item__relative">{item.countdownLabel || 'Upcoming'}</span>
                  <strong className="horizon-item__title">{itemIcon(item.type)} {item.title}</strong>
                  <div className="horizon-item__meta">
                    {formatHorizonDate(item)} · {itemTypeLabel(item.type)}
                  </div>
                  <span className="horizon-item__provenance">{sourceLabel}</span>
                </div>

                <div className="horizon-item__links">
                  {sourcePath && (
                    <Link to={sourcePath} className="button chip horizon-item__source-link">
                      View source
                    </Link>
                  )}
                  {hasDetails && (
                    <details className="horizon-item__details">
                      <summary>View details</summary>
                      <div>
                        {detailParts.length > 0 && <p>{detailParts.filter((part) => part !== item.time).join(' · ')}</p>}
                        {item.sourceText && <p>Source: “{item.sourceText}”</p>}
                        {isAppointment && item.details && <p>{item.details}</p>}
                      </div>
                    </details>
                  )}
                </div>

                <div className="horizon-item__desktop-details">
                  <div className="muted">
                    {[item.date, item.time, itemTypeLabel(item.type), ...detailParts.filter((part) => part !== item.time)].filter(Boolean).join(' · ')}
                  </div>
                  {item.sourceText && <div className="muted">Source: “{item.sourceText}”</div>}
                  {sourceState && <div className="muted">{sourceState}</div>}
                  {isAppointment && item.details && <div className="muted">{item.details}</div>}
                </div>

                {isAppointment && (onEditAppointment || onDeleteAppointment) && (
                  <span className="horizon-item__actions">
                    {onEditAppointment && (
                      <button type="button" className="button chip" onClick={() => onEditAppointment(item)} title="Edit appointment" disabled={Boolean(deletingAppointmentId)}>
                        Edit
                      </button>
                    )}
                    {onDeleteAppointment && (
                      <button
                        type="button"
                        className="button chip"
                        onClick={() => onDeleteAppointment(item)}
                        title={confirmingDelete ? confirmingAppointmentDeleteMessage || 'Confirm delete appointment' : 'Delete appointment'}
                        disabled={Boolean(deletingAppointmentId)}
                      >
                        {deleting ? 'Deleting…' : confirmingDelete ? 'Confirm Delete' : 'Delete'}
                      </button>
                    )}
                    {confirmingDelete && onCancelAppointmentDelete && (
                      <button type="button" className="button chip" onClick={onCancelAppointmentDelete} disabled={Boolean(deletingAppointmentId)}>
                        Cancel
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !error && items.length > 4 && (
        <button type="button" className="button chip horizon-show-more" onClick={() => setExpanded(true)}>
          Show more ({items.length - 4})
        </button>
      )}
    </section>
  );
}
