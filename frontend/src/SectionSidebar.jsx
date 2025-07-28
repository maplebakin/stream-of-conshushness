// SectionSidebar.jsx
import { useState, useEffect, useContext } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from './api/axiosInstance';
import { AuthContext } from './AuthContext.jsx';
import './Sidebar.css';

export default function SectionSidebar() {
  const { sectionName } = useParams();
  const { token } = useContext(AuthContext);
  const [pages, setPages] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    if (!token || !sectionName) return;
    axios
      .get(`/api/section-pages?section=${sectionName}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setPages(res.data);
      })
      .catch((err) => {
        console.error('❌ Error loading section data:', err);
      });
  }, [sectionName, token]);

  const handleCreatePage = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const slug = newTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
      const response = await axios.post(
        '/api/pages',
        {
          section: sectionName,
          slug,
          title: newTitle,
          content: newContent,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setPages([response.data, ...pages]);
      setNewTitle('');
      setNewContent('');
      setShowForm(false);
    } catch (err) {
      console.error('❌ Failed to create page:', err);
    }
  };

  return (
    <div className="sidebar">
      <h3>{sectionName}</h3>
      <ul>
        {pages.map((page) => (
          <li key={page._id}>
            <Link to={`/section/${sectionName}/${page.slug}`}>{page.title}</Link>
          </li>
        ))}
      </ul>

      <button onClick={() => setShowForm(!showForm)}>
        {showForm ? 'Cancel' : '➕ New Page'}
      </button>

      {showForm && (
        <form onSubmit={handleCreatePage} className="new-page-form">
          <input
            type="text"
            placeholder="Page title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            placeholder="Optional content"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={4}
          />
          <button type="submit">Create</button>
        </form>
      )}
    </div>
  );
}
