// Lightweight, offline heuristics for entry suggestions.
// Server remains canonical; this only runs if the API call fails.

export function suggestMetadataClient(text = '') {
  const t = String(text || '').toLowerCase();

  const tags = [];
  if (t.includes('doctor') || t.includes('appt')) tags.push('health');
  if (t.includes('school')) tags.push('school');
  if (t.includes('colton')) tags.push('colton');

  let type = 'suggestedTask';
  if (t.includes('call') || t.includes('email')) type = 'urgentTask';
  if (t.includes('birthday') || t.includes('anniversary')) type = 'importantEvent';

  const dueDate = null; // keep null; approving a ripple sets it to entryDate
  return { tags, type, dueDate };
}
