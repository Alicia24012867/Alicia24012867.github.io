import { useEffect } from 'react';

function setMeta(selector: string, content: string) {
  document.querySelector(selector)?.setAttribute('content', content);
}

/** Keep the document head in sync while a client-rendered route is on screen. */
export function usePageMeta({
  title,
  description,
  canonical,
  image,
  imageAlt,
  type = 'website',
}: {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  imageAlt?: string;
  type?: 'article' | 'website';
}) {
  useEffect(() => {
    document.title = title;
    setMeta('meta[property="og:type"]', type);
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    if (canonical) {
      setMeta('meta[property="og:url"]', canonical);
      document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical);
    }
    if (image) {
      setMeta('meta[property="og:image"]', image);
      setMeta('meta[name="twitter:image"]', image);
      if (imageAlt) {
        setMeta('meta[property="og:image:alt"]', imageAlt);
        setMeta('meta[name="twitter:image:alt"]', imageAlt);
      }
    }
  }, [title, description, canonical, image, imageAlt, type]);
}
