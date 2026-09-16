export function getStoredAppointmentId(appointment = {}) {
  if (!appointment || typeof appointment !== 'object') return '';
  if (appointment.seriesId) return String(appointment.seriesId);

  const rawId = appointment._id || appointment.id || '';
  const id = String(rawId);

  // Virtual recurring instances are not database records; edit/delete targets the stored series.
  if (id.startsWith('virtual:')) {
    return id.split(':')[1] || '';
  }

  return id;
}

export function isVirtualRecurringAppointment(appointment = {}) {
  if (!appointment || typeof appointment !== 'object') return false;
  const rawId = appointment._id || appointment.id || '';
  return String(rawId).startsWith('virtual:');
}

export function isRecurringAppointment(appointment = {}) {
  if (!appointment || typeof appointment !== 'object') return false;
  return Boolean(
    appointment.isRecurring ||
    appointment.seriesId ||
    appointment.rrule ||
    isVirtualRecurringAppointment(appointment)
  );
}

export function getAppointmentDeleteConfirmation(appointment = {}) {
  if (isVirtualRecurringAppointment(appointment)) {
    return 'This is part of a recurring appointment series. Delete the entire series?';
  }

  if (isRecurringAppointment(appointment)) {
    return 'Delete this recurring appointment series?';
  }

  return 'Delete this appointment?';
}

export function getAppointmentTimeLabel(appointment = {}, formatTime = (value) => value) {
  if (!appointment || typeof appointment !== 'object') return 'All day';
  const start = appointment.timeStart || appointment.time || '';
  const end = appointment.timeEnd || '';

  if (start && end) return `${formatTime(start)}-${formatTime(end)}`;
  if (start) return formatTime(start);
  return 'All day';
}

export function getAppointmentDetailParts(appointment = {}, formatTime) {
  if (!appointment || typeof appointment !== 'object') return ['All day'];
  const parts = [getAppointmentTimeLabel(appointment, formatTime)];

  if (appointment.location) parts.push(appointment.location);
  if (isRecurringAppointment(appointment)) parts.push('Recurring');

  return parts;
}
