// Keep track of edit vs. add
let editingId = null;

// Toggle the entry form
const toggleBtn = document.getElementById('toggle-entry-form');
const formBox   = document.querySelector('.add-entry');

// start collapsed
formBox.classList.remove ('active');
toggleBtn.addEventListener('click', () => {
  formBox.classList.toggle('active');
  toggleBtn.textContent = formBox.classList.contains('active')
    ? 'New Entry'
    : 'Close';
});

// On page load, fetch entries & tags
document.addEventListener('DOMContentLoaded', () => {
  loadAndRenderEntries();
  loadAndRenderTags();
});

// — Fetch & render entries (optionally filtered by section) —
function loadAndRenderEntries(filterSection) {
  fetch('/entries')
    .then(r => r.json())
    .then(entries => {
      const list = filterSection
        ? entries.filter(e => e.section === filterSection)
        : entries;
      renderEntries(list);
    })
    .catch(console.error);
}

// — Render entries into #feed —
function renderEntries(entries) {
  const feed = document.getElementById('feed');
  feed.innerHTML = '';

  entries.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'entry';
    div.dataset.id = entry.id;
    div.innerHTML = `
      <h3>${entry.date}</h3>
      <h4>${entry.section}</h4>
      <p>${entry.content.replace(/\n/g,'<br>')}</p>
      <p class="tags">${ entry.tags.length ? `#${entry.tags.join(' #')}` : '' }</p>
      <div class="entry-controls">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </div>
    `;

    // Edit
    div.querySelector('.edit-btn').addEventListener('click', () => {
      startEditing(entry);
      if (formBox.classList.contains('collapsed')) {
        formBox.classList.remove('collapsed');
        toggleBtn.textContent = 'Close';
      }
    });

    // Delete
    div.querySelector('.delete-btn').addEventListener('click', () => {
      if (!confirm('Delete this entry?')) return;
      fetch(`/delete-entry/${entry.id}`, { method: 'DELETE' })
        .then(r => {
          if (!r.ok) throw new Error('Delete failed');
          return r.json();
        })
        .then(() => loadAndRenderEntries())
        .catch(console.error);
    });

    feed.appendChild(div);
  });
}

// — Populate the form for editing —
function startEditing(entry) {
  editingId = entry.id;
  document.getElementById('date').value    = entry.date;
  document.getElementById('section').value = entry.section;
  document.getElementById('tags').value    = entry.tags.join(', ');
  document.getElementById('content').value = entry.content;
  document.getElementById('submit').textContent = 'Save Changes';
}

// — Handle form submit (Add vs Edit) —
document.getElementById('submit').addEventListener('click', () => {
  const date    = document.getElementById('date').value.trim();
  const section = document.getElementById('section').value.trim();
  const tags    = document.getElementById('tags').value
                   .split(',').map(t => t.trim()).filter(Boolean);
  const content = document.getElementById('content').value.trim();

  if (!date || !content) {
    alert('Date and content are required.');
    return;
  }

  const payload = { date, section, tags, content };
  const url     = editingId
    ? `/edit-entry/${editingId}`
    : '/add-entry';
  const method  = editingId ? 'PUT' : 'POST';

  fetch(url, {
    method,
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  })
  .then(r => {
    if (!r.ok) throw new Error('Save failed');
    return r.json();
  })
  .then(() => {
    resetForm();
    loadAndRenderEntries();
    loadAndRenderTags();
  })
  .catch(err => {
    console.error(err);
    alert('Error saving entry.');
  });
});

// — Reset form back to “Add Entry” —
function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

function resetForm() {
  editingId = null;
  document.getElementById('date').value = getTodayISO();
  document.getElementById('tags').value = '';
  document.getElementById('content').value = '';
  document.getElementById('submit').textContent = 'Add Entry';
}

// — Sidebar: filter by section —
document.querySelectorAll('.sections a').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.sections a').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    loadAndRenderEntries(link.dataset.section);
  });
});

// — Footer: fetch & render tags —
function loadAndRenderTags() {
  fetch('/entries')
    .then(r => r.json())
    .then(entries => {
      const allTags = Array.from(new Set(entries.flatMap(e => e.tags)));
      renderTags(allTags);
    })
    .catch(console.error);
}

function renderTags(tags) {
  const footer = document.getElementById('tag-footer');
  footer.innerHTML = '';
  tags.forEach(t => {
    const a = document.createElement('a');
    a.textContent = `#${t}`;
    a.href = '#';
    a.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('#tag-footer a').forEach(l => l.classList.remove('active'));
      a.classList.add('active');
      loadAndRenderEntriesByTag(t);
    });
    footer.appendChild(a);
  });
}

function loadAndRenderEntriesByTag(tag) {
  fetch('/entries')
    .then(r => r.json())
    .then(entries => {
      renderEntries(entries.filter(e => e.tags.includes(tag)));
    })
    .catch(console.error);
}

// — Live text search —
document.getElementById('search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  fetch('/entries')
    .then(r => r.json())
    .then(entries => {
      renderEntries(entries.filter(e =>
        e.content.toLowerCase().includes(q) ||
        e.section.toLowerCase().includes(q) ||
        e.tags.some(t => t.toLowerCase().includes(q))
      ));
    })
    .catch(console.error);
});
