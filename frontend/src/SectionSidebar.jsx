import { useNavigate, Link } from 'react-router-dom';
import './Sidebar.css';

export default function SectionSidebar({ sectionName, games = [], pages = [] }) {
  const navigate = useNavigate();

  const handleNewPage = () => {
    const title = prompt('Enter a title for the new page:');
    if (!title) return;
    const slug = title.toLowerCase().replace(/\s+/g, '-');
    navigate(`/section/${sectionName}/pages/${slug}/new`, { state: { title } });
  };

  return (
    <aside className="section-sidebar">
      <h2>{sectionName}</h2>

      {sectionName.toLowerCase() === 'games' && (
        <>
          <h3>🎮 Games</h3>
          <ul>
            {games.map((game) => (
              <li key={game._id}>
                <Link to={`/section/games/${game.slug}`}>{game.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>📄 Pages</h3>
      <ul>
        {pages.map((page) => (
          <li key={page._id}>
            <Link to={`/section/${sectionName}/pages/${page.slug}`}>{page.title}</Link>
          </li>
        ))}
      </ul>

      <button onClick={handleNewPage}>+ New Page</button>
    </aside>
  );
}
