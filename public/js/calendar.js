document.addEventListener('DOMContentLoaded', () => {
  const monthKey = '2025-07'; // We'll make this dynamic later
  const daysContainer = document.getElementById('calendarDays');
  const monthTitle = document.getElementById('monthTitle');
  const eventList = document.getElementById('eventList');
  const toggleButton = document.getElementById('toggleAddForm');
  const form = document.getElementById('addAppointmentForm');

  // ─── Load and Render Calendar JSON ───────────────
  fetch('/data/calendar.json')
    .then(response => response.json())
    .then(data => {
      const monthData = data[monthKey];
      if (!monthData) {
        console.error(`No data found for month ${monthKey}`);
        return;
      }

      // Update month title
      monthTitle.textContent = monthKeyToName(monthKey);

      // Render the grid
      renderDaysGrid(monthKey, monthData.days, daysContainer);

      // Render important events
      renderImportantEvents(monthData.importantEvents, eventList);
    })
    .catch(err => console.error('Error loading calendar.json:', err));


  // ─── Add Appointment Form Toggle ────────────────
  if (toggleButton && form) {
    toggleButton.addEventListener('click', () => {
      form.classList.toggle('expanded');
      form.classList.toggle('collapsed');

      toggleButton.textContent = form.classList.contains('expanded') ? '– Cancel' : '+ Add Appointment';
    });
  }

  // ─── Add Appointment Form Submission ─────────────
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const date = document.getElementById('appointmentDate')?.value;
      const time = document.getElementById('appointmentTime')?.value;
      const details = document.getElementById('appointmentDetails')?.value;

      if (!date || !time || !details) {
        alert('Please fill in all fields.');
        return;
      }

      fetch('/add-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, details })
      })
        .then(res => {
          if (!res.ok) throw new Error('Server error: ' + res.status);
          return res.json();
        })
        .then(data => {
          console.log('✅ Appointment added:', data);
          alert('Appointment added successfully!');
          form.reset();
          location.reload();
        })
        .catch(err => {
          console.error('❌ Error adding appointment:', err);
          alert('Failed to add appointment.');
        });
    });
  }
});


// ─── Helpers ──────────────────────────────────────
function monthKeyToName(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${monthNames[month - 1]} ${year}`;
}

function renderDaysGrid(monthKey, daysData, container) {
  container.innerHTML = '';

  // 1️⃣ Add weekday headers
  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  weekdays.forEach(dayName => {
    const header = document.createElement('div');
    header.classList.add('calendar-header');
    header.textContent = dayName;
    container.appendChild(header);
  });

  // 2️⃣ Offset
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = 31;
  const firstDay = new Date(year, month - 1, 1).getDay();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.classList.add('calendar-day', 'empty-day');
    container.appendChild(empty);
  }

  // 3️⃣ Render actual days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
    const button = document.createElement('button');
    button.classList.add('calendar-day');
    button.setAttribute('data-day', day);

    // Check if this day has data
    const dayData = daysData && daysData[dateStr];

    // Add note preview
    if (dayData && dayData.freeForm && dayData.freeForm.length > 0) {
      const note = document.createElement('div');
      note.classList.add('day-note');
      note.textContent = dayData.freeForm[0];
      button.appendChild(note);
      button.classList.add('has-note');
    }

    // Add appointment preview
    if (dayData && dayData.schedule && Object.keys(dayData.schedule).length > 0) {
      const appt = document.createElement('div');
      appt.classList.add('day-appointment');
      appt.textContent = '🗓️ ' + Object.values(dayData.schedule)[0];
      button.appendChild(appt);
      button.classList.add('has-appointment');
    }

    button.addEventListener('click', () => {
      window.location.href = `/daily.html?date=${dateStr}`;
    });

    container.appendChild(button);
  }
}

function renderImportantEvents(events, list) {
  list.innerHTML = '';
  if (!events || events.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No important events this month.';
    list.appendChild(li);
    return;
  }

  events.forEach(event => {
    const li = document.createElement('li');
    li.textContent = event;
    list.appendChild(li);
  });
}
