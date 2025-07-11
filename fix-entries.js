const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'entries.json');

let entries = JSON.parse(fs.readFileSync(FILE, 'utf8'));

entries = entries.map(entry => {
  if (typeof entry.tags === 'string') {
    if (entry.tags.trim() === '') {
      entry.tags = [];
    } else {
      entry.tags = entry.tags.split(',').map(s => s.trim());
    }
  } else if (!Array.isArray(entry.tags)) {
    entry.tags = [];
  }
  return entry;
});

fs.writeFileSync(FILE, JSON.stringify(entries, null, 2));
console.log('✅ entries.json has been fixed!');
