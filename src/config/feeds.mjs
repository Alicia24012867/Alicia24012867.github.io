// Canonical production URLs stay stable in local previews and feed readers.
export const blogFeed = {
  siteUrl: 'https://alicia24012867.github.io/',
  title: 'Alicia · Blog',
  description: 'Code, learning, and little discoveries worth sharing.',
  author: 'Alicia',
  language: 'en',
};

export const feedFormats = [
  { path: '/rss.xml', label: 'RSS', type: 'application/rss+xml' },
  { path: '/atom.xml', label: 'Atom', type: 'application/atom+xml' },
];
