import { useState } from 'react';
import Icon from '../components/Icon';
import { friendLinks, homepageLinks, visibleLinks } from '../config/links';
import { linkIcon, type LinkIcon } from './linkIcon';

// The configuration is static, so empty entries and groups are dropped once.
const groups = [
  { id: 'elsewhere', title: 'Elsewhere', links: visibleLinks(homepageLinks) },
  { id: 'friends', title: 'Friends', links: visibleLinks(friendLinks) },
]
  .filter((group) => group.links.length > 0)
  .map((group) => ({
    ...group,
    links: group.links.map((link) => ({ ...link, icon: linkIcon(link) })),
  }));

/** The linked website's own icon, or a globe when its image cannot be loaded. */
function SiteIcon({ icon }: { icon: LinkIcon }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="link-site-icon">
      {'image' in icon && !failed ? (
        <img
          src={icon.image}
          alt=""
          width="16"
          height="16"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon name={'name' in icon ? icon.name : 'globe'} />
      )}
    </span>
  );
}

export default function Links() {
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
                  <SiteIcon icon={link.icon} />
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
