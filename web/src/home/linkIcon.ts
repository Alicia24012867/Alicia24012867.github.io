import type { IconName } from '../components/Icon';
import type { HomepageLink } from '../config/links.ts';

export type LinkIcon = { image: string } | { name: IconName };

/**
 * Each link shows its website's icon: the `icon` image when set, the site's own
 * GitHub mark for GitHub, or the site's favicon. Images that fail show a globe.
 */
export function linkIcon({ url, icon }: HomepageLink): LinkIcon {
  if (icon?.trim()) return { image: icon.trim() };
  let address: URL;
  try {
    address = new URL(url.trim());
  } catch {
    return { name: 'globe' };
  }
  if (address.protocol === 'mailto:') return { name: 'mail' };
  if (!['http:', 'https:'].includes(address.protocol)) return { name: 'globe' };
  if (/(^|\.)github\.com$/.test(address.hostname)) return { name: 'github' };
  return { image: new URL('/favicon.ico', address).href };
}
