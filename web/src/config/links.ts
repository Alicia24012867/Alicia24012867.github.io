import { profile } from './profile.ts';

export type HomepageLink = {
  name: string;
  url: string;
  /** Optional image for the site's icon, such as an avatar; found automatically otherwise. */
  icon?: string;
};

// Your own profiles and websites, displayed under Elsewhere.
export const homepageLinks: HomepageLink[] = [{ name: 'GitHub', url: profile.github }];

// Friends' websites. Empty groups and entries with blank names or URLs stay hidden.
// Example: { name: "Alex's blog", url: 'https://example.com' },
export const friendLinks: HomepageLink[] = [{ name: 'Hanalin', url: 'https://hanalin.top' }];

/** The homepage section and its navigation item share this rule. */
export const visibleLinks = (links: HomepageLink[]) =>
  links.filter((link) => link.name.trim() && link.url.trim());
