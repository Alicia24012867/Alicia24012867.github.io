import Icon from '../components/Icon';
import { friendLinks, homepageLinks } from '../config/links';

const linkGroups = [
  { id: 'elsewhere', title: 'Elsewhere', links: homepageLinks },
  { id: 'friends', title: 'Friends', links: friendLinks },
];

export default function Links() {
  const groups = linkGroups
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => link.name.trim() && link.url.trim()),
    }))
    .filter((group) => group.links.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="homepage-links page-width" id="links">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`homepage-links-${group.id}`}>
          <h2 id={`homepage-links-${group.id}`}>{group.title}</h2>
          <ul className="homepage-links-list">
            {group.links.map((link) => (
              <li key={link.url}>
                <a href={link.url.trim()} target="_blank" rel="noopener noreferrer">
                  <span>{link.name}</span>
                  <Icon name="arrow" className="diagonal-arrow" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
