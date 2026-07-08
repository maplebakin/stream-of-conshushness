import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance.js';
import { getAppointmentDetailParts, getStoredAppointmentId } from '../utils/appointmentIds.js';

function itemIcon(type) {
  return type === 'appointment' ? '🗓️' : '⭐';
}

function itemTypeLabel(type) {
  return type === 'appointment' ? 'Appointment' : 'Important event';
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
  onCancelAppointmentDelete,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        if (!cancelled) setItems(Array.isArray(data?.items) ? data.items : []);
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
    <section className="on-the-horizon" style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'grid', gap: 8 }}>
        <h3 className="font-thread text-vein" style={{ margin: 0 }}>On the Horizon</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
            return (
              <li
                key={`${item.type}-${item.id}`}
                className="task"
                style={{ background: 'var(--card,#fff)', borderRadius: 12, padding: '8px 10px', display: 'grid', gap: 4 }}
              >
                <div style={{ display: 'grid', gap: 2 }}>
                  <span className="muted" title={item.date}>
                    {item.displayLabel || `${item.countdownLabel || ''} ${item.title || ''}`.trim()}
                  </span>
                  <strong>{itemIcon(item.type)} {item.title}</strong>
                </div>

                <div className="muted" style={{ fontSize: 13 }}>
                  {[item.date, item.time, itemTypeLabel(item.type), ...detailParts.filter((part) => part !== item.time)].filter(Boolean).join(' · ')}
                </div>

                {item.sourceText && (
                  <div className="muted" style={{ fontSize: 13 }}>
                    Source: "{item.sourceText}"
                  </div>
                )}
                {isAppointment && item.details && (
                  <div className="muted" style={{ fontSize: 13 }}>{item.details}</div>
                )}

                {isAppointment && (onEditAppointment || onDeleteAppointment) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {onEditAppointment && (
                      <button type="button" className="button chip" onClick={() => onEditAppointment(item)} title="Edit appointment">
                        Edit
                      </button>
                    )}
                    {onDeleteAppointment && (
                      <button
                        type="button"
                        className="button chip"
                        onClick={() => onDeleteAppointment(item)}
                        title={confirmingDelete ? confirmingAppointmentDeleteMessage || 'Confirm delete appointment' : 'Delete appointment'}
                      >
                        {confirmingDelete ? 'Confirm Delete' : 'Delete'}
                      </button>
                    )}
                    {confirmingDelete && onCancelAppointmentDelete && (
                      <button type="button" className="button chip" onClick={onCancelAppointmentDelete}>
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
    </section>
  );
}
