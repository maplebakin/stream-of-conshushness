const fs = require('fs');
const path = require('path');

// Adjust this if your entries file is in a different location
const filePath = path.join(__dirname, 'data', 'entries.json');

console.log(`Loading entries from: ${filePath}`);

// Load entries
let entries;
try {
  entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (error) {
  console.error('Error reading entries.json:', error);
  process.exit(1);
}

// Helper to convert to YYYY-MM-DD
function toISODate(humanDate) {
  if (!humanDate) return '';
  const parsed = new Date(humanDate);
  if (isNaN(parsed)) {
    console.warn(`Could not parse date: "${humanDate}"`);
    return '';
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

// Fix entries
entries.forEach(entry => {
  const oldDate = entry.date;
  const newDate = toISODate(entry.date);
  if (newDate) {
    entry.date = newDate;
  } else {
    console.warn(`Entry ID ${entry.id} has invalid date: "${oldDate}" — leaving unchanged.`);
  }
});

try {
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  console.log('✅ Dates fixed and saved back to entries.json!');
} catch (error) {
  console.error('Error writing entries.json:', error);
}
