import test from 'node:test';
import assert from 'node:assert/strict';
import { friendLinks, homepageLinks, visibleLinks } from '../src/config/links.ts';
import { linkIcon } from '../src/home/linkIcon.ts';

test('homepage links show their website icon, GitHub mark, or a fallback', () => {
  assert.deepEqual(linkIcon({ name: 'GitHub', url: 'https://github.com/Alicia24012867' }), {
    name: 'github',
  });
  assert.deepEqual(linkIcon({ name: 'Gist', url: 'https://gist.github.com/someone' }), {
    name: 'github',
  });
  assert.deepEqual(linkIcon({ name: 'Blog', url: ' https://example.com/blog/post?x=1#top ' }), {
    image: 'https://example.com/favicon.ico',
  });
  // GitHub Pages sites are their owners' own websites, with their own icons.
  assert.deepEqual(linkIcon({ name: 'Pages', url: 'https://alex.github.io/notes/' }), {
    image: 'https://alex.github.io/favicon.ico',
  });
  assert.deepEqual(
    linkIcon({ name: 'Avatar', url: 'https://example.com', icon: ' /images/friend.png ' }),
    { image: '/images/friend.png' },
  );
  assert.deepEqual(linkIcon({ name: 'Mail', url: 'mailto:hi@example.com' }), { name: 'mail' });
  assert.deepEqual(linkIcon({ name: 'Broken', url: 'not a url' }), { name: 'globe' });
  assert.deepEqual(linkIcon({ name: 'FTP', url: 'ftp://example.com/file' }), { name: 'globe' });
});

test('every configured link resolves an icon', () => {
  for (const link of visibleLinks([...homepageLinks, ...friendLinks])) {
    const icon = linkIcon(link);
    assert.ok('image' in icon ? URL.canParse(icon.image, 'https://nymphilia.com') : icon.name);
  }
});
