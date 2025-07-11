const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dataPath = path.join(__dirname, 'data', 'entries.json');

// Load existing entries
let entries = [];
try {
  const data = fs.readFileSync(dataPath, 'utf8');
  entries = JSON.parse(data);
} catch (err) {
  console.error('Error reading entries.json:', err);
  process.exit(1);
}

// Add ID if missing
let changed = false;
entries = entries.map(entry => {
  if (!entry.id) {
    entry.id = uuidv4();
    changed = true;
  }
  return entry;
});

// Save back
if (changed) {
  fs.writeFileSync(dataPath, JSON.stringify(entries, null, 2));
  console.log('✅ Entries patched: IDs added.');
} else {
  console.log('✅ All entries already had IDs. No changes made.');
}
