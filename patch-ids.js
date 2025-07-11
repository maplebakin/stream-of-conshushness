const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dataPath = path.join(__dirname, 'data', 'entries.json');

let entries;
try {
  entries = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
} catch (err) {
  console.error('Error reading entries.json:', err);
  process.exit(1);
}

let changed = false;

entries = entries.map(entry => {
  if (!entry.id) {
    entry.id = uuidv4();
    changed = true;
  }
  return entry;
});

if (changed) {
  fs.writeFileSync(dataPath, JSON.stringify(entries, null, 2));
  console.log('✅ IDs added to missing entries.');
} else {
  console.log('✅ All entries already have IDs.');
}
