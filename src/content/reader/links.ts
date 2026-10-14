import { slugFromLocation, type Collection } from '../urls.ts';

/** The slug of another document in `collection` that `href` on `page` points to, if any. */
export function linkedDocument(href: string, page: string, collection: Collection) {
  let url: URL;
  let here: URL;
  try {
    here = new URL(page);
    url = new URL(href, here);
  } catch {
    return undefined;
  }
  if (url.origin !== here.origin) return undefined;
  const slug = slugFromLocation(collection, url);
  return slug && slug !== slugFromLocation(collection, here) ? slug : undefined;
}
