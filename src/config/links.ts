import { profile } from './profile';

type HomepageLink = { name: string; url: string };

// Your own profiles and websites, displayed under Elsewhere.
export const homepageLinks: HomepageLink[] = [{ name: 'GitHub', url: profile.github }];

// Friends' websites. Empty groups and entries with blank names or URLs stay hidden.
// Example: { name: "Alex's blog", url: 'https://example.com' },
export const friendLinks: HomepageLink[] = [{ name: 'Hanalin', url: 'https://hanalin.top' }];
