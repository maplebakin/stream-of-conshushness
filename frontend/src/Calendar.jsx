import { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance';
import './Calendar.css';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from './AuthContext.jsx';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useSearch } from "./SearchContext.jsx";

export default function Calendar() {
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);
  const { search } = useSearch();

  const getTodayISO = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayStr = getTodayISO();

  const [calendarData, setCalendarData] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [showForm, setShowForm] = useState(false);
  const [newAppointment, setNewAppointment] = useState({ date: '', time: '', details: '' });
  const [importantEvents, setImportantEvents] = useState([]);
  const [newEvent, setNewEvent] = useState({ title: '', date: '' });
  const [showEventForm, setShowEventForm] = useState(false);
  const [showMonthMenu, setShowMonthMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 800);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 800);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!token) return;
    if (!selectedMonth || selectedMonth.trim() === '') {
      setSelectedMonth(defaultMonth);
      return;
    }
    fetchCalendar();
    // eslint-disable-next-line
  }, [token, selectedMonth]);

  const goToToday = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    navigate(`/day/${isoDate}`);
  };

  const fetchCalendar = () => {
    if (!token || !selectedMonth || selectedMonth.trim() === '') return;
    setLoadingCalendar(true);

    axios
      .get(`/api/calendar-data/${selectedMonth}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setCalendarData(res.data?.calendarData || {}))
      .catch((err) => {
        setCalendarData({});
        console.error('Error fetching calendar:', err);
      })
      .finally(() => setLoadingCalendar(false));

    axios
      .get(`/api/important-events/${selectedMonth}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setImportantEvents(res.data || []))
      .catch((err) => {
        setImportantEvents([]);
        console.error('Error fetching important events:', err);
      });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newAppointment.date || !newAppointment.time || !newAppointment.details) {
      toast.error('Please fill all fields');
      return;
    }
    const d = new Date(newAppointment.date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const normalizedDate = `${yyyy}-${mm}-${dd}`;
    const payload = { ...newAppointment, date: normalizedDate };

    toast
      .promise(
        axios.post('/api/appointments', payload, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        {
          loading: 'Saving appointment…',
          success: 'Appointment saved!',
          error: 'Error saving appointment',
        }
      )
      .then(() => {
        fetchCalendar();
        setShowForm(false);
        setNewAppointment({ date: '', time: '', details: '' });
      })
      .catch(() => {});
  };

  const handleDeleteAppointment = (id, e) => {
    e.stopPropagation();
    toast
      .promise(
        axios.delete(`/api/appointments/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        {
          loading: 'Deleting appointment…',
          success: 'Appointment deleted!',
          error: 'Error deleting appointment',
        }
      )
      .then(() => fetchCalendar())
      .catch(() => {});
  };

  // Optional Edit pattern for appointment (add edit logic if you want)
  const handleEditAppointment = (appointment, e) => {
    e.stopPropagation();
    setShowForm(true);
    setNewAppointment(appointment);
  };

  const handleAddImportantEvent = (e) => {
    e.preventDefault();
    if (!newEvent.title.trim() || !newEvent.date.trim()) {
      toast.error('Please fill in both title and date.');
      return;
    }
    toast
      .promise(
        axios.post('/api/important-events', newEvent, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        {
          loading: 'Adding event…',
          success: 'Event added!',
          error: 'Error adding event',
        }
      )
      .then(() => {
        setNewEvent({ title: '', date: '' });
        fetchCalendar();
      })
      .catch(() => {});
  };

  const handleDeleteImportantEvent = (id) => {
    toast
      .promise(
        axios.delete(`/api/important-events/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        {
          loading: 'Deleting event…',
          success: 'Event deleted!',
          error: 'Error deleting event',
        }
      )
      .then(() => fetchCalendar())
      .catch(() => {});
  };

  // Optional Edit for important event
  const handleEditImportantEvent = (event) => {
    setShowEventForm(true);
    setNewEvent(event);
  };

  const handleDayClick = (dateStr) => navigate(`/day/${dateStr}`);

  const handleMonthChange = (direction) => {
    if (!selectedMonth) return;
    const [y, m] = selectedMonth.split('-').map(Number);
    const date = new Date(y, m - 1 + direction);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const formatMonthYear = (monthKey) => {
    const [yyyy, mm] = monthKey.split('-');
    const date = new Date(yyyy, mm - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const getDaysUntil = (dateStr) => {
    const eventDate = new Date(dateStr);
    const today = new Date(todayStr);
    eventDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 1) return `${diffDays} Days Away`;
    return `${Math.abs(diffDays)} Days Ago`;
  };

  const [year, month] = selectedMonth
    ? selectedMonth.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const monthData = calendarData[selectedMonth]?.days || {};

  const monthOptions = [
    ['J', 'January', '01'],
    ['F', 'February', '02'],
    ['MR', 'March', '03'],
    ['MA', 'April', '04'],
    ['MY', 'May', '05'],
    ['JN', 'June', '06'],
    ['JL', 'July', '07'],
    ['AU', 'August', '08'],
    ['S', 'September', '09'],
    ['O', 'October', '10'],
    ['N', 'November', '11'],
    ['D', 'December', '12'],
  ];

  const renderMonthTab = ([abbr, full, monthNum]) => {
    const yearStr = String(now.getFullYear());
    const monthKey = `${yearStr}-${monthNum}`;
    const active = monthKey === selectedMonth;
    return (
      <div
        key={monthKey}
        className={`month-tab ${active ? 'active' : ''}`}
        onClick={() => {
          setSelectedMonth(monthKey);
          setShowMonthMenu(false);
        }}
      >
        {isMobile ? full : (
          <>
            <span className="collapsed-label">{abbr}</span>
            <span className="expanded-label">{full}</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="calendar-page">
      <header>
        <h1>Stream of Conshushness — Calendar</h1>
        <nav>
          <Link to="/">🡐 Back to Journal</Link>
        </nav>
      </header>

      <div className="calendar-layout">
        <aside className="important-events">
          <h3>Important Events</h3>
          <button
            type="button"
            className="toggle-event-form-button"
            onClick={() => setShowEventForm(!showEventForm)}
          >
            {showEventForm ? 'Hide Add Event' : '+ Add Event'}
          </button>
          {showEventForm && (
            <form className="important-event-form" onSubmit={handleAddImportantEvent}>
              <input
                type="text"
                placeholder="Event Title"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              />
              <DatePicker
                selected={newEvent.date ? new Date(newEvent.date) : null}
                onChange={(date) => {
                  if (date) {
                    const yyyy = date.getFullYear();
                    const mm = String(date.getMonth() + 1).padStart(2, '0');
                    const dd = String(date.getDate()).padStart(2, '0');
                    setNewEvent({ ...newEvent, date: `${yyyy}-${mm}-${dd}` });
                  }
                }}
                dateFormat="yyyy-MM-dd"
              />
              <button type="submit">+ Add Event</button>
            </form>
          )}
          <ul className="important-event-list">
            {importantEvents.length === 0 && (
              <li className="no-events">No important events for this month.</li>
            )}
            {importantEvents.map((ev) => (
              <li key={ev._id}>
                <span>
                  {getDaysUntil(ev.date)}: {ev.title}
                </span>
                {/* Optional Edit Button */}
                {/* <button className="edit-button" onClick={() => handleEditImportantEvent(ev)}>✏️</button> */}
                <button className="delete-button" onClick={() => handleDeleteImportantEvent(ev._id)}>
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="calendar-content">
          <div className="calendar-header">
            <div className="month-nav">
              <button onClick={() => handleMonthChange(-1)}>&lt;</button>
              <h2>{formatMonthYear(selectedMonth)}</h2>
              <button onClick={() => handleMonthChange(1)}>&gt;</button>
            </div>
          </div>

          <div className="add-appointment">
            <div className="add-appointment-buttons">
              <button onClick={() => setShowForm(!showForm)}>
                {showForm ? 'Close' : '+ Add Appointment'}
              </button>
              <button onClick={goToToday}>Today</button>
            </div>
            {showForm && (
              <form onSubmit={handleSubmit}>
                <label>
                  Date
                  <DatePicker
                    selected={newAppointment.date ? new Date(newAppointment.date) : null}
                    onChange={(date) => {
                      if (date) {
                        const yyyy = date.getFullYear();
                        const mm = String(date.getMonth() + 1).padStart(2, '0');
                        const dd = String(date.getDate()).padStart(2, '0');
                        setNewAppointment({
                          ...newAppointment,
                          date: `${yyyy}-${mm}-${dd}`,
                        });
                      }
                    }}
                    dateFormat="yyyy-MM-dd"
                  />
                </label>
                <label>
                  Time
                  <DatePicker
                    selected={
                      newAppointment.time
                        ? new Date(`1970-01-01T${newAppointment.time}:00`)
                        : null
                    }
                    onChange={(time) => {
                      if (time) {
                        const hhmm = time.toTimeString().slice(0, 5);
                        setNewAppointment({ ...newAppointment, time: hhmm });
                      }
                    }}
                    showTimeSelect
                    showTimeSelectOnly
                    timeIntervals={30}
                    timeCaption="Time"
                    dateFormat="HH:mm"
                  />
                </label>
                <label>
                  Details
                  <input
                    type="text"
                    value={newAppointment.details}
                    onChange={(e) =>
                      setNewAppointment({ ...newAppointment, details: e.target.value })
                    }
                  />
                </label>
                <button type="submit">Save Appointment</button>
              </form>
            )}
          </div>

          {loadingCalendar ? (
            <div className="calendar-loading">Loading calendar…</div>
          ) : (
            <div className="calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="day-of-week">
                  {d}
                </div>
              ))}
              {Array.from({ length: firstWeekday }, (_, i) => (
                <div key={`empty-${i}`} className="empty-cell" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayData = monthData[dateStr];

                // 🔍 Search highlighting: day matches global search
                const matchesGlobalSearch =
                  !!search &&
                  ((dayData?.entries && dayData.entries.some(entry =>
                    entry.content?.toLowerCase().includes(search.toLowerCase())
                  )) ||
                    (dayData?.tasks && dayData.tasks.some(task =>
                      task.details?.toLowerCase().includes(search.toLowerCase())
                    )));

                return (
                  <div
                    key={dateStr}
                    className={`calendar-day${dayData ? ' has-note' : ''}${dateStr === todayStr ? ' today' : ''}${matchesGlobalSearch ? ' search-match' : ''}`}
                    onClick={() => handleDayClick(dateStr)}
                    tabIndex={0}
                    aria-label={`Day ${day}${dateStr === todayStr ? ', today' : ''}${dayData ? ', has appointment' : ''}`}
                    aria-current={dateStr === todayStr ? "date" : undefined}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleDayClick(dateStr);
                    }}
                  >
                    <div className="date-label">{day}</div>
                    {/* Show appointments/tasks/entries indicators */}
                    {dayData?.schedule &&
                      Object.entries(dayData.schedule).map(([time, entry]) => {
                        if (!entry) return null;
                        const details = typeof entry === 'string' ? entry : entry.details ?? '';
                        return (
                          <div key={time} className="day-appointment">
                            <span>
                              {time} - {details}
                            </span>
                            {entry._id && (
                              <>
                                {/* Optional Edit Button */}
                                {/* <button className="edit-button" onClick={(e) => handleEditAppointment(entry, e)}>✏️</button> */}
                                <button
                                  className="delete-button"
                                  onClick={(e) => handleDeleteAppointment(entry._id, e)}
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    {/* Optional: entries/tasks indicators */}
                    {dayData?.entries?.length > 0 && (
                      <div className="calendar-entry-indicator" title={`${dayData.entries.length} entries`}>
                        📝 {dayData.entries.length}
                      </div>
                    )}
                    {dayData?.tasks?.length > 0 && (
                      <div className="calendar-task-indicator" title={`${dayData.tasks.length} tasks`}>
                        ✔️ {dayData.tasks.length}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Month tabs stay UNTOUCHED! */}
        {!isMobile && (
          <aside className="calendar-sidebar">
            <div className="month-tabs">{monthOptions.map(renderMonthTab)}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
