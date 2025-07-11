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

entries = entries.map(entry => {
  entry.id = uuidv4();  // always assign fresh UUID
  return entry;
});

fs.writeFileSync(dataPath, JSON.stringify(entries, null, 2));
console.log('✅ All entries now have fresh UUIDs.');
